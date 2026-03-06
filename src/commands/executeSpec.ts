import * as vscode from 'vscode';
import * as path from 'path';
import { parseSpec } from '../specs/parser';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot, writeWorkspaceFile, readWorkspaceFile } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import { validateBudget } from '../execution/budgetEnforcer';
import { loadSkills } from '../execution/skillsLoader';
import { assembleExecutionContext } from '../execution/contextAssembler';
import { CliRunner } from '../execution/cliRunner';
import { captureResults } from '../execution/resultCapture';
import { runPostValidation } from '../execution/postValidation';
import { getClaudeCliBinary, getTestCommand, getAutoValidate } from '../config/extensionConfig';
import { EXECUTIONS_FOLDER } from '../utils/constants';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import type { ExecutionConfig } from '../execution/types';

// Singleton runner — only one spec executes at a time.
const _runner = new CliRunner();

export function createExecuteSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem): Promise<void> => {
    // --- Resolve file path ---
    let filePath: string | undefined;
    if (item && item.kind === 'spec') {
      filePath = item.filePath;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.fileName.endsWith('.sdd.md')) {
        filePath = editor.document.fileName;
      }
    }

    if (!filePath) {
      vscode.window.showErrorMessage('No spec file selected or open.');
      return;
    }

    // --- Parse spec ---
    const uri = vscode.Uri.file(filePath);
    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch {
      vscode.window.showErrorMessage(`Could not read spec file: ${path.basename(filePath)}`);
      return;
    }

    const parseResult = parseSpec(content);
    if (!parseResult.success) {
      const msg = parseResult.errors.map((e) => e.message).join('; ');
      vscode.window.showErrorMessage(`Parse error: ${msg}`);
      return;
    }

    const spec = parseResult.data;
    const specId = spec.frontmatter.spec_id;

    // --- Pre-flight: status must be "ready" ---
    if (spec.frontmatter.status !== 'ready') {
      vscode.window.showErrorMessage(
        `Cannot execute ${specId}: spec must be in "ready" status (current: "${spec.frontmatter.status}").`
      );
      return;
    }

    // --- Pre-flight: no other execution running ---
    if (_runner.isRunning()) {
      vscode.window.showErrorMessage(
        'Another spec is currently executing. Only one spec can execute at a time.'
      );
      return;
    }

    // --- Pre-flight: Claude CLI available ---
    const claudeCliBinary = getClaudeCliBinary();
    const cliAvailable = await isCommandAvailable(claudeCliBinary);
    if (!cliAvailable) {
      vscode.window.showErrorMessage(
        `Claude CLI not found: "${claudeCliBinary}". Install it or update sdd.claudeCliBinary in settings.`
      );
      return;
    }

    // --- Pre-flight: budget validation ---
    const budget = spec.frontmatter.budget_max_tokens;
    const budgetValidation = validateBudget(budget);
    if (!budgetValidation.valid) {
      vscode.window.showErrorMessage(
        `Budget validation failed for ${specId}: ${budgetValidation.warning}`
      );
      return;
    }
    if (budgetValidation.warning) {
      vscode.window.showWarningMessage(`${specId} budget warning: ${budgetValidation.warning}`);
    }

    // --- Build execution config ---
    const testCommand = await getTestCommand();
    const autoValidate = getAutoValidate();
    const config: ExecutionConfig = {
      maxTokens: budget,
      claudeCliBinary,
      testCommand,
      autoValidate,
    };

    // --- Execute with progress ---
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Executing ${specId}`,
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          _runner.abort();
        });

        // Transition → in_progress
        progress.report({ message: 'Starting…', increment: 5 });
        try {
          await updateSpecStatus(uri, content, 'in_progress');
          refresh();
        } catch {
          vscode.window.showErrorMessage(`Failed to update spec status for ${specId}.`);
          return;
        }



        let executionResult: Awaited<ReturnType<typeof _runner.execute>> | undefined;
        try {
          // Load skills
          progress.report({ message: 'Loading skills…', increment: 10 });
          const skills = spec.frontmatter.agent_skills
            ? await loadSkills(spec.frontmatter.agent_skills)
            : undefined;

          // Assemble context
          progress.report({ message: 'Assembling context…', increment: 15 });
          const context = await assembleExecutionContext(spec, { skills });

          // Execute via CliRunner
          progress.report({ message: 'Running Claude CLI…', increment: 20 });
          executionResult = await _runner.execute(spec, context, config);

          if (token.isCancellationRequested) {
            // Save partial results then revert status
            const capture = await captureResults(specId, {
              ...executionResult,
              success: false,
              error: executionResult.error ?? 'Cancelled by user',
            });
            await patchExecutionRecord(capture, { status: 'aborted' });

            await updateSpecStatus(uri, content, 'ready');
            refresh();
            vscode.window.showWarningMessage(`${specId} execution cancelled.`);
            return;
          }

          // Capture results
          progress.report({ message: 'Capturing results…', increment: 20 });
          const capture = await captureResults(specId, executionResult);

          if (!executionResult.success) {
            throw new Error(executionResult.error ?? 'CLI execution failed');
          }

          // Post-validation
          let testsPassed: boolean | null = null;
          if (autoValidate && testCommand) {
            progress.report({ message: 'Running tests…', increment: 20 });
            const root = getWorkspaceRoot();
            const validation = await runPostValidation(config, root ?? undefined);
            testsPassed = validation.passed;
            await patchExecutionRecord(capture, { testsPassed });
          }

          // Transition → review
          progress.report({ message: 'Wrapping up…', increment: 10 });
          await updateSpecStatus(uri, content, 'review');
          refresh();

          vscode.window.showInformationMessage(
            `${specId} execution complete — ready for review.`
          );
        } catch (err) {
          if (token.isCancellationRequested) {
            return; // already handled above
          }
          const message = err instanceof Error ? err.message : String(err);

          // Save partial results if execution ran
          if (executionResult) {
            try {
              await captureResults(specId, {
                ...executionResult,
                success: false,
                error: message,
              });
            } catch {
              // best-effort capture
            }
          }

          // Revert to "ready" on failure
          try {
            await updateSpecStatus(uri, content, 'ready');
            refresh();
          } catch {
            // best-effort revert
          }

          vscode.window.showErrorMessage(`${specId} execution failed: ${message}`);
        }
      }
    );
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateSpecStatus(
  uri: vscode.Uri,
  originalContent: string,
  status: string
): Promise<void> {
  // Re-read the file in case it was updated since we last read it
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    content = Buffer.from(bytes).toString('utf8');
  } catch {
    content = originalContent;
  }

  const { data, body } = parseFrontmatter(content);
  data['status'] = status;
  const updated = serializeFrontmatter(data, body);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));
}

type RecordPatch = { status?: string; testsPassed?: boolean | null };

async function patchExecutionRecord(
  capture: { record: { specId: string; executionNumber: number } },
  patch: RecordPatch
): Promise<void> {
  const { specId, executionNumber } = capture.record;
  const paddedNum = String(executionNumber).padStart(3, '0');
  const jsonPath = `${EXECUTIONS_FOLDER}/${specId}/exec-${paddedNum}.json`;

  const raw = await readWorkspaceFile(jsonPath);
  if (!raw) {
    return;
  }

  try {
    const record = JSON.parse(raw) as Record<string, unknown>;
    Object.assign(record, patch);
    await writeWorkspaceFile(jsonPath, JSON.stringify(record, null, 2));
  } catch {
    // best-effort patch
  }
}

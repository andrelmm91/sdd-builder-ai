import * as vscode from 'vscode';
import * as path from 'path';
import { parseSpec } from '../specs/parser';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot, writeWorkspaceFile, readWorkspaceFile } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import { getBudgetForComplexity } from '../execution/budgetEnforcer';
import { CliRunner } from '../execution/cliRunner';
import { captureResults } from '../execution/resultCapture';
import { runPostValidation } from '../execution/postValidation';
import { getClaudeCliBinary, getTestCommand, getAutoValidate } from '../config/extensionConfig';
import { readAIConfig } from '../config/aiConfig';
import { EXECUTIONS_FOLDER } from '../utils/constants';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import type { ExecutionConfig } from '../execution/types';

// Singleton runner — only one spec executes at a time.
const _runner = new CliRunner();

/**
 * Core execution logic for a single spec. Called by both the direct Execute command
 * and the bulk queue manager.
 */
export async function executeSingleSpec(filePath: string, refresh?: () => void): Promise<boolean> {
  const doRefresh = refresh ?? (() => { /* noop */ });

  // --- Parse spec ---
  const uri = vscode.Uri.file(filePath);
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    content = Buffer.from(bytes).toString('utf8');
  } catch {
    vscode.window.showErrorMessage(`Could not read spec file: ${path.basename(filePath)}`);
    return false;
  }

  const parseResult = parseSpec(content);
  if (!parseResult.success) {
    const msg = parseResult.errors.map((e) => e.message).join('; ');
    vscode.window.showErrorMessage(`Parse error: ${msg}`);
    return false;
  }

  const spec = parseResult.data;
  const specId = spec.frontmatter.spec_id;

  // --- Pre-flight: status must be "ready" ---
  if (spec.frontmatter.status !== 'ready') {
    vscode.window.showErrorMessage(
      `Cannot execute ${specId}: spec must be in "ready" status (current: "${spec.frontmatter.status}").`
    );
    return false;
  }

  // --- Pre-flight: no other execution running ---
  if (_runner.isRunning()) {
    vscode.window.showErrorMessage(
      'Another spec is currently executing. Only one spec can execute at a time.'
    );
    return false;
  }

  // --- Pre-flight: Claude CLI available ---
  const claudeCliBinary = getClaudeCliBinary();
  const cliAvailable = await isCommandAvailable(claudeCliBinary);
  if (!cliAvailable) {
    vscode.window.showErrorMessage(
      `Claude CLI not found: "${claudeCliBinary}". Install it or update sdd.claudeCliBinary in settings.`
    );
    return false;
  }

  // --- Derive budget from complexity ---
  const budget = getBudgetForComplexity(spec.frontmatter.complexity);

  // --- Read AI config ---
  const aiConfig = await readAIConfig();

  // --- Build execution config ---
  const testCommand = await getTestCommand();
  const autoValidate = getAutoValidate();
  const config: ExecutionConfig = {
    maxTokens: budget,
    claudeCliBinary,
    testCommand,
    autoValidate,
  };

  const root = getWorkspaceRoot();
  const relativeSpecPath = root ? path.relative(root, filePath) : filePath;

  // ── Interactive execution path ────────────────────────────────────────────
  // Interactive modes (Claude default/plan, Copilot ask) use a single persistent
  // notification with the "Complete & Close Terminal" action button.
  // withProgress cannot host custom buttons, so we use showInformationMessage
  // as the sole control point for the duration of the AI session.
  if (isInteractiveMode(aiConfig)) {
    try {
      await updateSpecStatus(uri, content, 'in_progress');
      doRefresh();
    } catch {
      vscode.window.showErrorMessage(`Failed to update spec status for ${specId}.`);
      return false;
    }

    // Start execution non-blocking so the notification can appear simultaneously.
    const executePromise = _runner.execute(spec, config, aiConfig, relativeSpecPath);
    let cancelledByUser = false;

    vscode.window.showInformationMessage(
      `Executing ${specId}: AI is running interactively. Click when done.`,
      'Complete & Close Terminal',
      'Cancel',
    ).then(selection => {
      if (selection === 'Complete & Close Terminal') {
        _runner.completeInteractive();
      } else if (selection === 'Cancel') {
        cancelledByUser = true;
        _runner.abort();
      }
    });

    let executionResult: Awaited<ReturnType<typeof _runner.execute>>;
    try {
      executionResult = await executePromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSpecStatus(uri, content, 'ready').catch(() => {});
      doRefresh();
      vscode.window.showErrorMessage(`${specId} execution failed: ${message}`);
      return false;
    }

    if (cancelledByUser) {
      try {
        const capture = await captureResults(specId, {
          ...executionResult,
          success: false,
          error: executionResult.error ?? 'Cancelled by user',
        });
        await patchExecutionRecord(capture, { status: 'aborted' });
        await updateSpecStatus(uri, content, 'ready');
        doRefresh();
      } catch { /* best-effort */ }
      vscode.window.showWarningMessage(`${specId} execution cancelled.`);
      return false;
    }

    try {
      const capture = await captureResults(specId, executionResult);
      if (!executionResult.success) {
        throw new Error(executionResult.error ?? 'CLI execution failed');
      }
      if (autoValidate && testCommand) {
        const validation = await runPostValidation(config, root ?? undefined);
        await patchExecutionRecord(capture, { testsPassed: validation.passed });
      }
      await updateSpecStatus(uri, content, 'review');
      doRefresh();
      vscode.window.showInformationMessage(`${specId} execution complete — ready for review.`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await captureResults(specId, { ...executionResult, success: false, error: message });
      } catch { /* best-effort */ }
      try {
        await updateSpecStatus(uri, content, 'ready');
        doRefresh();
      } catch {
        vscode.window.showErrorMessage(
          `${specId} execution failed and the spec status could not be reverted — please manually set it back to "ready".`
        );
      }
      vscode.window.showErrorMessage(`${specId} execution failed: ${message}`);
      return false;
    }
  }

  // ── Non-interactive execution path (progress notification) ────────────────
  let success = false;
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
        doRefresh();
      } catch {
        vscode.window.showErrorMessage(`Failed to update spec status for ${specId}.`);
        return;
      }

      let executionResult: Awaited<ReturnType<typeof _runner.execute>> | undefined;
      try {
        // Execute via CliRunner (relativeSpecPath computed above, outside withProgress)
        progress.report({ message: 'Running CLI…', increment: 45 });
        executionResult = await _runner.execute(spec, config, aiConfig, relativeSpecPath);

        if (token.isCancellationRequested) {
          // Save partial results then revert status
          const capture = await captureResults(specId, {
            ...executionResult,
            success: false,
            error: executionResult.error ?? 'Cancelled by user',
          });
          await patchExecutionRecord(capture, { status: 'aborted' });

          await updateSpecStatus(uri, content, 'ready');
          doRefresh();
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
        if (autoValidate && testCommand) {
          progress.report({ message: 'Running tests…', increment: 20 });
          const validation = await runPostValidation(config, root ?? undefined);
          await patchExecutionRecord(capture, { testsPassed: validation.passed });
        }

        // Transition → review
        progress.report({ message: 'Wrapping up…', increment: 10 });
        await updateSpecStatus(uri, content, 'review');
        doRefresh();

        vscode.window.showInformationMessage(`${specId} execution complete — ready for review.`);
        success = true;
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
          doRefresh();
        } catch {
          vscode.window.showErrorMessage(
            `${specId} execution failed and the spec status could not be reverted — please manually set it back to "ready".`
          );
        }

        vscode.window.showErrorMessage(`${specId} execution failed: ${message}`);
      }
    }
  );

  return success;
}

export function createExecuteSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    // --- Resolve file path ---
    let filePath: string | undefined;
    if (typeof item === 'string') {
      filePath = item;
    } else if (item && item.kind === 'spec') {
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

    await executeSingleSpec(filePath, refresh);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for modes where the AI runs in an interactive REPL (not one-shot). */
function isInteractiveMode(aiConfig: Awaited<ReturnType<typeof readAIConfig>>): boolean {
  if (!aiConfig) return true; // default to interactive if config is absent
  if (aiConfig.provider === 'copilot') {
    return aiConfig.permissionMode !== 'yolo';
  }
  return aiConfig.permissionMode !== 'dangerously-skip-permissions';
}

/**
 * Guards bulk execution: shows a blocking warning modal when the current AI
 * config is not set to a full-permission mode (Claude dangerously-skip-permissions
 * or Copilot yolo).  Interactive modes require manual approval per tool use,
 * which makes unattended sequential bulk execution impossible.
 *
 * Returns `true` if execution may proceed, `false` if the user should abort.
 */
export async function requireFullPermissionForBulk(): Promise<boolean> {
  const aiConfig = await readAIConfig();

  // Full-permission check
  const isFullPermission = aiConfig
    ? aiConfig.provider === 'copilot'
      ? aiConfig.permissionMode === 'yolo'
      : aiConfig.permissionMode === 'dangerously-skip-permissions'
    : false;

  if (isFullPermission) return true;

  const provider = aiConfig?.provider ?? 'claude';
  const permissionMode = aiConfig?.permissionMode ?? 'default';
  const providerLabel = provider === 'copilot' ? 'Copilot' : 'Claude';
  const fullPermLabel = provider === 'copilot' ? '"yolo"' : '"dangerously-skip-permissions"';

  const selection = await vscode.window.showWarningMessage(
    `Bulk execution requires full permission mode.\n\nCurrent: ${providerLabel} — ${permissionMode}\n\nIn interactive modes each tool use requires manual approval, making unattended bulk execution impossible. Switch to ${fullPermLabel} in AI Settings to continue.`,
    { modal: true },
    'Open AI Settings',
  );

  if (selection === 'Open AI Settings') {
    void vscode.commands.executeCommand('sdd.openAiConfig');
  }
  return false;
}

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

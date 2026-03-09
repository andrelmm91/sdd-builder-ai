import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readAIConfig } from '../config/aiConfig';
import { IDEALIZATION_FILENAME } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import type { AIConfig } from '../config/aiConfigTypes';

const IDEALIZATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TEMP_PROMPT_FILE = '.sdd/idealize-prompt.md';

export async function idealizeRequirements(featureName: string, folderPath: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('SDD: No workspace folder is open.');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Idealizing requirements for ${featureName}...`,
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Preparing prompt...' });

      const featureRelativePath = `.sdd/product/${featureName}/${featureName}.md`;
      const prompt = buildIdealizePrompt(featureRelativePath);

      const promptFileUri = vscode.Uri.file(path.join(root, TEMP_PROMPT_FILE));
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(promptFileUri.fsPath)));
      await vscode.workspace.fs.writeFile(promptFileUri, new TextEncoder().encode(prompt));

      try {
        const cliBinary = getClaudeCliBinary();
        const available = await isCommandAvailable(cliBinary);
        if (!available) {
          vscode.window.showErrorMessage(
            `SDD: AI CLI not found: "${cliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
          );
          return;
        }

        if (token.isCancellationRequested) return;

        progress.report({ message: 'Running AI...' });

        const aiConfig = await readAIConfig();
        const command = buildCommand(cliBinary, aiConfig, promptFileUri.fsPath);

        const result = await spawnWithCancellation(command, root, token, IDEALIZATION_TIMEOUT_MS);

        if (token.isCancellationRequested) return;

        if (!result.success) {
          vscode.window.showErrorMessage(
            `SDD: Idealization failed — ${result.error ?? 'AI CLI returned an error'}`,
          );
          return;
        }

        progress.report({ message: 'Validating output...' });

        try {
          await postValidate(root, featureName, folderPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`SDD: Post-validation failed — ${message}`);
          return;
        }

        vscode.window.showInformationMessage(`SDD: Idealization complete for "${featureName}".`);
      } finally {
        try {
          await vscode.workspace.fs.delete(promptFileUri);
        } catch {
          // best-effort cleanup
        }
      }
    },
  );
}

function buildIdealizePrompt(featureRelativePath: string): string {
  return (
    `Based on the following feature description, acceptance criteria and notes\n` +
    `in @${featureRelativePath}, create a new markdown file\n` +
    `(named idealization.md) in the same folder with a concise idealization of this feature.\n` +
    `Make sure to include all the important information and recommendations.\n` +
    `The idealization should be clear and easy to understand for the development team.`
  );
}

function buildCommand(cliBinary: string, aiConfig: AIConfig | undefined, promptFilePath: string): string {
  const provider = aiConfig?.provider ?? 'claude';

  if (provider === 'copilot') {
    const parts = ['github', 'copilot'];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'yolo') parts.push('--yolo');
    parts.push(`"$(cat '${promptFilePath}')"`);
    return parts.join(' ');
  }

  // Claude provider (default) — no --print so AI can write files to disk
  const parts = [cliBinary];
  if (aiConfig?.model) parts.push('--model', aiConfig.model);
  if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
    parts.push('--dangerously-skip-permissions');
  } else if (aiConfig?.permissionMode === 'plan') {
    parts.push('--plan');
  }
  // Pass prompt as positional arg (not stdin) so @ file references are resolved
  parts.push(`"$(cat '${promptFilePath}')"`);
  return parts.join(' ');
}

function spawnWithCancellation(
  command: string,
  cwd: string,
  token: vscode.CancellationToken,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = cp.spawn(command, [], { shell: true, cwd });
    let settled = false;

    const settle = (result: { success: boolean; error?: string }) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      settle({ success: false, error: 'Timed out after 10 minutes' });
    }, timeoutMs);

    token.onCancellationRequested(() => {
      child.kill('SIGTERM');
      clearTimeout(timeout);
      settle({ success: false, error: 'Cancelled by user' });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      settle(code === 0 ? { success: true } : { success: false, error: `Process exited with code ${code}` });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      settle({ success: false, error: err.message });
    });
  });
}

async function postValidate(_root: string, featureName: string, folderPath: string): Promise<void> {
  const folderUri = vscode.Uri.file(folderPath);
  const idealizationUri = vscode.Uri.joinPath(folderUri, IDEALIZATION_FILENAME);
  const today = new Date().toISOString().slice(0, 10);

  // Ensure idealization.md exists; rename an AI-created .md file if needed
  let found = false;
  try {
    await vscode.workspace.fs.stat(idealizationUri);
    found = true;
  } catch {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith('.md') && name !== `${featureName}.md`) {
        await vscode.workspace.fs.rename(
          vscode.Uri.joinPath(folderUri, name),
          idealizationUri,
          { overwrite: true },
        );
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new Error(`idealization.md was not created in ${folderPath}`);
  }

  // Ensure frontmatter has status: "Idealization In Review" and date
  const bytes = await vscode.workspace.fs.readFile(idealizationUri);
  const content = new TextDecoder().decode(bytes);
  const { data, body } = parseFrontmatter(content);

  if (data['status'] !== 'Idealization In Review' || !data['date']) {
    const updated: Record<string, unknown> = { ...data, status: 'Idealization In Review', date: today };
    const newContent = serializeFrontmatter(updated, body);
    await vscode.workspace.fs.writeFile(idealizationUri, new TextEncoder().encode(newContent));
  }

  // Update original feature file status
  const featureFileUri = vscode.Uri.joinPath(folderUri, `${featureName}.md`);
  await updateFeatureStatus(featureFileUri, 'Idealization In Review');
}

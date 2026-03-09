import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readAIConfig } from '../config/aiConfig';
import { IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { spawnWithCancellation } from '../execution/processSpawner';

const IDEALIZATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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

      const featureRelativePath = `${PRODUCT_FOLDER}/${featureName}/${featureName}.md`;
      const prompt = buildIdealizePrompt(featureRelativePath);

      const tempPromptFile = `.sdd/tmp/idealize-${Date.now()}.md`;
      const promptFileUri = vscode.Uri.file(path.join(root, tempPromptFile));
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
        const command = buildCliCommand({
          cliBinary,
          aiConfig,
          promptArg: `"$(cat '${promptFileUri.fsPath}')"`,
        });

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

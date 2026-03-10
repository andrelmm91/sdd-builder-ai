import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readRequirementsAIConfig } from '../config/aiConfig';
import { DEFAULT_REQUIREMENTS_AI_CONFIG } from '../config/aiConfigTypes';
import { IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { execCommand } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { runInTerminal } from '../execution/processSpawner';

const IDEALIZATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function idealizeRequirements(featureName: string, folderPath: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('SDD: No workspace folder is open.');
    return;
  }

  const featureRelativePath = `${PRODUCT_FOLDER}/${featureName}/${featureName}.md`;
  const reqConfig = await readRequirementsAIConfig();
  const template = reqConfig?.idealizePromptTemplate ?? DEFAULT_REQUIREMENTS_AI_CONFIG.idealizePromptTemplate;
  const prompt = template.replace('{feature_path}', featureRelativePath);

  const tempPromptPath = path.join(root, `.sdd/tmp/idealize-${Date.now()}.md`);
  const promptFileUri = vscode.Uri.file(tempPromptPath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(tempPromptPath)));
  await vscode.workspace.fs.writeFile(promptFileUri, new TextEncoder().encode(prompt));

  const loginShell = process.env.SHELL || '/bin/zsh';
  const cliBinary = getClaudeCliBinary();

  // Check availability using the login shell so we respect the user's full PATH
  const which = await execCommand(`${loginShell} -l -c "which ${cliBinary}"`, { timeout: 5000 });
  if (!which.success) {
    vscode.window.showErrorMessage(
      `SDD: AI CLI not found: "${cliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
    );
    try { await vscode.workspace.fs.delete(promptFileUri); } catch { /* ignore */ }
    return;
  }

  const command = buildCliCommand({
    cliBinary,
    aiConfig: reqConfig,
    promptArg: `"$(cat '${tempPromptPath}')"`,
  });

  await runInTerminal({
    command,
    terminalName: `SDD: Idealize ${featureName}`,
    cwd: root,
    timeoutMs: IDEALIZATION_TIMEOUT_MS,
    onSuccess: async () => {
      try {
        await postValidate(root, featureName, folderPath);
        vscode.window.showInformationMessage(`SDD: Idealization complete for "${featureName}".`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`SDD: Post-validation failed — ${message}`);
      }
    },
    onFailure: (exitCode) => {
      vscode.window.showErrorMessage(
        `SDD: Idealization failed — AI CLI exited with code ${exitCode ?? 'unknown'}`,
      );
    },
  });

  try { await vscode.workspace.fs.delete(promptFileUri); } catch { /* ignore */ }
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

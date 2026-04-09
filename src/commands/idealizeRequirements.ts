import * as vscode from 'vscode';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readRequirementsAIConfig } from '../config/aiConfig';
import { DEFAULT_REQUIREMENTS_AI_CONFIG } from '../config/aiConfigTypes';
import type { RequirementsAIConfig } from '../config/aiConfigTypes';
import { IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { runInTerminal } from '../execution/processSpawner';

/**
 * Returns true when the requirements AI config uses an interactive execution mode —
 * i.e. Claude plan mode, Claude default (REPL), or Copilot non-yolo (ask mode).
 * Mirrors the isInteractiveMode logic used in executeSpec.ts for the kanban workflow.
 */
function isInteractiveMode(config: RequirementsAIConfig | null | undefined): boolean {
  if (!config) return true;
  if (config.provider === 'copilot') return config.permissionMode !== 'yolo';
  return config.permissionMode !== 'dangerously-skip-permissions';
}

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
  const filePrefix = (reqConfig?.provider ?? 'claude') === 'copilot' ? '#file:' : '@';
  const prompt = template
    .replace(/{file_prefix}/g, filePrefix)
    .replace('{feature_path}', featureRelativePath);

  const cliBinary = getClaudeCliBinary();
  const available = await isCommandAvailable(cliBinary);
  if (!available) {
    vscode.window.showErrorMessage(
      `SDD: AI CLI not found: "${cliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
    );
    return;
  }

  const command = buildCliCommand({ cliBinary, aiConfig: reqConfig, prompt });
  const interactive = isInteractiveMode(reqConfig);

  // For interactive modes (Claude default/plan/REPL, Copilot ask), show a persistent
  // notification with a "Complete & Close Terminal" button — exactly as the kanban
  // workflow does via executeSpec.ts. Clicking it closes the terminal which resolves
  // the runInTerminal promise via the onDidCloseTerminal listener.
  let terminalRef: vscode.Terminal | undefined;
  const executionPromise = runInTerminal({
    command,
    terminalName: `SDD: Idealize ${featureName}`,
    cwd: root,
    timeoutMs: IDEALIZATION_TIMEOUT_MS,
    logName: featureName,
    interactive,
    onTerminalReady: (t) => { terminalRef = t; },
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

  if (interactive) {
    vscode.window.showInformationMessage(
      `SDD: Idealizing "${featureName}" — AI is running interactively. Click when done.`,
      'Complete & Close Terminal',
    ).then((selection) => {
      if (selection === 'Complete & Close Terminal') {
        terminalRef?.dispose();
      }
    });
  }

  await executionPromise;
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

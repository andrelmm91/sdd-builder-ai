import * as vscode from 'vscode';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readRequirementsAIConfig } from '../config/aiConfig';
import { DEFAULT_REQUIREMENTS_AI_CONFIG } from '../config/aiConfigTypes';
import type { RequirementsAIConfig } from '../config/aiConfigTypes';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION, IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { runInTerminal } from '../execution/processSpawner';

function isInteractiveMode(config: RequirementsAIConfig | null | undefined): boolean {
  if (!config) return true;
  if (config.provider === 'copilot') return config.permissionMode !== 'yolo';
  return config.permissionMode !== 'dangerously-skip-permissions';
}

const SDD_CARDS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function createSddCards(featureName: string, folderPath: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('SDD: No workspace folder is open.');
    return;
  }

  const idealizationRelativePath = `${PRODUCT_FOLDER}/${featureName}/${IDEALIZATION_FILENAME}`;
  const reqConfig = await readRequirementsAIConfig();
  const template = reqConfig?.createSddCardsPromptTemplate ?? DEFAULT_REQUIREMENTS_AI_CONFIG.createSddCardsPromptTemplate;
  const filePrefix = (reqConfig?.provider ?? 'claude') === 'copilot' ? '#file:' : '@';
  const prompt = template
    .replace(/{file_prefix}/g, filePrefix)
    .replace('{idealization_path}', idealizationRelativePath)
    .replace('{specs_folder}', SPECS_FOLDER);

  const cliBinary = getClaudeCliBinary();
  const available = await isCommandAvailable(cliBinary);
  if (!available) {
    vscode.window.showErrorMessage(
      `SDD: AI CLI not found: "${cliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
    );
    return;
  }

  // Snapshot existing .sdd.md files before AI call
  const specsBefore = await listSpecFiles(root);

  const command = buildCliCommand({ cliBinary, aiConfig: reqConfig, prompt });
  const interactive = isInteractiveMode(reqConfig);

  let terminalRef: vscode.Terminal | undefined;
  const executionPromise = runInTerminal({
    command,
    terminalName: `SDD: Create Cards ${featureName}`,
    cwd: root,
    timeoutMs: SDD_CARDS_TIMEOUT_MS,
    logName: featureName,
    interactive,
    onTerminalReady: (t) => { terminalRef = t; },
    onSuccess: async () => {
      const specsAfter = await listSpecFiles(root);
      const newSpecs = specsAfter.filter((f) => !specsBefore.includes(f));

      if (newSpecs.length === 0) {
        vscode.window.showErrorMessage(
          `SDD: No .sdd.md files were created in ${SPECS_FOLDER}. Check the AI output.`,
        );
        return;
      }

      const folderUri = vscode.Uri.file(folderPath);
      const idealizationUri = vscode.Uri.joinPath(folderUri, IDEALIZATION_FILENAME);
      const featureFileUri = vscode.Uri.joinPath(folderUri, `${featureName}.md`);

      await updateFeatureStatus(idealizationUri, 'SDD Created');
      await updateFeatureStatus(featureFileUri, 'SDD Created');

      vscode.window.showInformationMessage(
        `SDD: Created ${newSpecs.length} spec file${newSpecs.length !== 1 ? 's' : ''} for "${featureName}".`,
      );
    },
    onFailure: () => {
      vscode.window.showErrorMessage(
        `SDD: SDD card creation failed — AI CLI exited with an error. Check the terminal output.`,
      );
    },
  });

  if (interactive) {
    vscode.window.showInformationMessage(
      `SDD: Creating SDD cards for "${featureName}" — AI is running interactively. Click when done.`,
      'Complete & Close Terminal',
    ).then((selection) => {
      if (selection === 'Complete & Close Terminal') {
        terminalRef?.dispose();
      }
    });
  }

  await executionPromise;
}


async function listSpecFiles(root: string): Promise<string[]> {
  const specsUri = vscode.Uri.file(path.join(root, SPECS_FOLDER));
  try {
    const entries = await vscode.workspace.fs.readDirectory(specsUri);
    return entries
      .filter(([name, type]) => type === vscode.FileType.File && name.endsWith(SPEC_FILE_EXTENSION))
      .map(([name]) => name);
  } catch {
    return [];
  }
}

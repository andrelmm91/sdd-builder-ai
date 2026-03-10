import * as vscode from 'vscode';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readRequirementsAIConfig } from '../config/aiConfig';
import { DEFAULT_REQUIREMENTS_AI_CONFIG } from '../config/aiConfigTypes';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION, IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { runInTerminal } from '../execution/processSpawner';

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
  const prompt = template
    .replace('{idealization_path}', idealizationRelativePath)
    .replace('{specs_folder}', SPECS_FOLDER);

  const tempPromptPath = path.join(root, `.sdd/tmp/create-sdd-cards-${Date.now()}.md`);
  const promptFileUri = vscode.Uri.file(tempPromptPath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(tempPromptPath)));
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

    // Snapshot existing .sdd.md files before AI call
    const specsBefore = await listSpecFiles(root);

    const command = buildCliCommand({
      cliBinary,
      aiConfig: reqConfig,
      promptArg: `"$(cat '${tempPromptPath}')"`,
    });

    await runInTerminal({
      command,
      terminalName: `SDD: Create Cards ${featureName}`,
      cwd: root,
      timeoutMs: SDD_CARDS_TIMEOUT_MS,
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
  } finally {
    try {
      await vscode.workspace.fs.delete(promptFileUri);
    } catch {
      // best-effort cleanup
    }
  }
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

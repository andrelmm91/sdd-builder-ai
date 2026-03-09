import * as vscode from 'vscode';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readAIConfig } from '../config/aiConfig';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION, IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { spawnWithCancellation } from '../execution/processSpawner';

const SDD_CARDS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function createSddCards(featureName: string, folderPath: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('SDD: No workspace folder is open.');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Creating SDD cards for ${featureName}...`,
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Preparing prompt...' });

      // Snapshot existing .sdd.md files before AI call
      const specsBefore = await listSpecFiles(root);

      const idealizationRelativePath = `${PRODUCT_FOLDER}/${featureName}/${IDEALIZATION_FILENAME}`;
      const prompt = buildCreateSddCardsPrompt(idealizationRelativePath);

      const tempPromptFile = `.sdd/tmp/create-sdd-cards-${Date.now()}.md`;
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

        const result = await spawnWithCancellation(command, root, token, SDD_CARDS_TIMEOUT_MS);

        if (token.isCancellationRequested) return;

        if (!result.success) {
          vscode.window.showErrorMessage(
            `SDD: SDD card creation failed — ${result.error ?? 'AI CLI returned an error'}`,
          );
          return;
        }

        progress.report({ message: 'Validating output...' });

        // Detect newly created spec files
        const specsAfter = await listSpecFiles(root);
        const newSpecs = specsAfter.filter((f) => !specsBefore.includes(f));

        if (newSpecs.length === 0) {
          vscode.window.showErrorMessage(
            `SDD: No .sdd.md files were created in ${SPECS_FOLDER}. Check the AI output.`,
          );
          return;
        }

        // Update statuses to "SDD Created"
        const folderUri = vscode.Uri.file(folderPath);
        const idealizationUri = vscode.Uri.joinPath(folderUri, IDEALIZATION_FILENAME);
        const featureFileUri = vscode.Uri.joinPath(folderUri, `${featureName}.md`);

        await updateFeatureStatus(idealizationUri, 'SDD Created');
        await updateFeatureStatus(featureFileUri, 'SDD Created');

        vscode.window.showInformationMessage(
          `SDD: Created ${newSpecs.length} spec file${newSpecs.length !== 1 ? 's' : ''} for "${featureName}".`,
        );
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

function buildCreateSddCardsPrompt(idealizationRelativePath: string): string {
  return (
    `Create new phases and SDDs in @${SPECS_FOLDER}/ to fulfill the requirements\n` +
    `in @${idealizationRelativePath} by using skills\n` +
    `in @.claude/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed.`
  );
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

import * as vscode from 'vscode';
import { PlannerOrchestrator } from '../planning/planner';
import { getSpecPrefix } from '../config/extensionConfig';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import * as path from 'path';
import type { GeneratedSpec } from '../planning/types';

const SPEC_ID_FROM_FILENAME_RE = /^([A-Z]+-\d+)/;

async function gatherExistingSpecIds(): Promise<string[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return [];

  const root = workspaceFolders[0].uri;
  const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
  const uris = await vscode.workspace.findFiles(pattern);

  const ids: string[] = [];
  for (const uri of uris) {
    const basename = path.basename(uri.fsPath, SPEC_FILE_EXTENSION);
    const match = SPEC_ID_FROM_FILENAME_RE.exec(basename);
    if (match) ids.push(match[1]);
  }
  return ids;
}

async function openGeneratedSpecs(
  specs: GeneratedSpec[],
  workspaceRoot: string
): Promise<void> {
  for (const spec of specs) {
    const filePath = path.join(workspaceRoot, SPECS_FOLDER, `${spec.specId}-${spec.slug}${SPEC_FILE_EXTENSION}`);
    try {
      await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
    } catch {
      // Non-fatal: file path may differ; tree refresh will surface it
    }
  }
}

export async function refinePlan(): Promise<void> {
  const requirements = await vscode.window.showInputBox({
    title: 'SDD: Refine Plan — Requirements',
    prompt: 'Enter the requirements you are refining',
    placeHolder: 'Describe what you want to build...',
    ignoreFocusOut: true,
  });

  if (!requirements) return;

  const feedback = await vscode.window.showInputBox({
    title: 'SDD: Refine Plan — Feedback',
    prompt: 'Enter feedback to guide the refinement',
    placeHolder: 'e.g. Split the auth spec into two separate specs...',
    ignoreFocusOut: true,
  });

  if (!feedback) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Planning specs...',
      cancellable: true,
    },
    async (progress, token) => {
      const [existingSpecIds, projectPrefix] = await Promise.all([
        gatherExistingSpecIds(),
        getSpecPrefix(),
      ]);

      const orchestrator = new PlannerOrchestrator((message) => {
        progress.report({ message });
      });

      const refinePromise = orchestrator.refine({
        requirements,
        feedback,
        existingSpecIds,
        projectPrefix,
      });

      const cancelPromise = new Promise<never>((_, reject) => {
        token.onCancellationRequested(() => reject(new Error('Planning cancelled by user')));
      });

      let result;
      try {
        result = await Promise.race([refinePromise, cancelPromise]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/cancelled/i.test(msg)) {
          vscode.window.showInformationMessage('Planning cancelled.');
        } else {
          vscode.window.showErrorMessage(`Refinement failed: ${msg}`);
        }
        return;
      }

      if (!result.success) {
        vscode.window.showErrorMessage(`Refinement failed: ${result.error}`);
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      await openGeneratedSpecs(result.specs, workspaceRoot);

      vscode.window.showInformationMessage(
        `Refinement complete: ${result.specs.length} spec(s) generated.`
      );
    }
  );
}

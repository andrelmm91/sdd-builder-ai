import * as vscode from 'vscode';
import { ReviewManager } from '../review/reviewManager';
import { DiffProvider } from '../review/diffProvider';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';

const _diffProvider = new DiffProvider();
const _reviewManager = new ReviewManager(_diffProvider);

async function resolveSpecId(item?: SpecTreeItem | string): Promise<string | undefined> {
  if (item && typeof item === 'object' && item.kind === 'spec') return item.spec.spec_id;
  if (typeof item === 'string') {
    try {
      const uri = vscode.Uri.file(item);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const { data } = parseFrontmatter(content);
      if (data['spec_id']) return data['spec_id'] as string;
    } catch { /* fall through */ }
  }
  return undefined;
}

/** Returns the absolute file path for the spec, or undefined if it cannot be resolved. */
function resolveSpecFilePath(item?: SpecTreeItem | string): string | undefined {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && item.kind === 'spec') return item.filePath;
  return undefined;
}

/**
 * Appends feedback to the `## Context` section of a spec body and sets its status to `ready`.
 * Writes the result back to the file at `filePath`.
 */
export async function applyRequestChanges(filePath: string, feedback: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = Buffer.from(bytes).toString('utf8');
  const { data, body } = parseFrontmatter(content);

  // Append feedback entry to the ## Context section
  const feedbackLine = `\nFeedback for re-execution: ${feedback}`;
  let newBody: string;
  const contextMatch = /^## Context\b/m.exec(body);
  if (contextMatch) {
    const afterContext = body.slice(contextMatch.index + contextMatch[0].length);
    const nextHeadingMatch = /\n## /.exec(afterContext);
    if (nextHeadingMatch) {
      const insertAt = contextMatch.index + contextMatch[0].length + nextHeadingMatch.index;
      newBody = body.slice(0, insertAt) + feedbackLine + body.slice(insertAt);
    } else {
      newBody = body + feedbackLine + '\n';
    }
  } else {
    newBody = body + feedbackLine + '\n';
  }

  const updated = serializeFrontmatter({ ...data, status: 'ready' }, newBody);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));
}


export function createReviewSpecCommand(_refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const specId = await resolveSpecId(item);
    if (!specId) {
      vscode.window.showErrorMessage('No spec selected. Right-click a spec in the sidebar.');
      return;
    }
    await _reviewManager.openReview(specId);
  };
}

export function createApproveSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const specId = await resolveSpecId(item);
    if (!specId) {
      vscode.window.showErrorMessage('No spec selected.');
      return;
    }

    const confirmed = await vscode.window.showInformationMessage(
      `Approve spec ${specId}?`,
      { modal: true },
      'Approve'
    );
    if (confirmed !== 'Approve') return;

    try {
      await _reviewManager.submitDecision(specId, 'approve');
      refresh();
      vscode.window.showInformationMessage(`${specId} approved.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Approve failed: ${message}`);
    }
  };
}

export function createRequestChangesCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const specId = await resolveSpecId(item);
    const filePath = resolveSpecFilePath(item);
    if (!specId || !filePath) {
      vscode.window.showErrorMessage('No spec selected.');
      return;
    }

    const feedback = await vscode.window.showInputBox({
      title: `Request Changes — ${specId}`,
      prompt: 'Describe what needs to be fixed',
      placeHolder: 'e.g. The error handling for empty inputs is missing…',
      ignoreFocusOut: true,
    });
    if (feedback === undefined) return; // user cancelled

    try {
      await applyRequestChanges(filePath, feedback || '');
      refresh();
      vscode.window.showInformationMessage(`${specId} moved back to Ready with feedback.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Request changes failed: ${message}`);
    }
  };
}

export function createRejectSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const specId = await resolveSpecId(item);
    if (!specId) {
      vscode.window.showErrorMessage('No spec selected.');
      return;
    }
    try {
      // Confirmation dialog is handled inside ReviewManager.submitDecision for 'reject'
      await _reviewManager.submitDecision(specId, 'reject');
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Reject failed: ${message}`);
    }
  };
}

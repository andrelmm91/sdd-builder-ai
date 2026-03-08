import * as vscode from 'vscode';
import { ReviewManager } from '../review/reviewManager';
import { DiffProvider } from '../review/diffProvider';
import { saveFeedback } from '../review/feedbackWriter';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import { parseFrontmatter } from '../utils/frontmatter';

const _diffProvider = new DiffProvider();
const _reviewManager = new ReviewManager(_diffProvider);

async function resolveSpecId(item?: SpecTreeItem | string): Promise<string | undefined> {
  if (item && typeof item === 'object' && item.kind === 'spec') return item.spec.spec_id;
  if (typeof item === 'string') {
    // item is a file path — parse spec_id from the file
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
    if (!specId) {
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
      await _reviewManager.submitDecision(specId, 'request_changes', feedback || undefined);

      // Persist human-readable markdown via feedbackWriter
      const history = await _reviewManager.getReviewHistory(specId);
      const latestRecord = history[history.length - 1];
      if (latestRecord) {
        await saveFeedback(specId, latestRecord);
      }

      refresh();

      const choice = await vscode.window.showInformationMessage(
        `Feedback saved for ${specId}. Would you like to re-execute with this feedback?`,
        'Re-execute',
        'Not now'
      );
      if (choice === 'Re-execute') {
        await vscode.commands.executeCommand('sdd.executeSpec', item);
      }
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

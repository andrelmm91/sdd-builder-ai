import * as vscode from 'vscode';
import { ReviewManager } from '../review/reviewManager';
import { DiffProvider } from '../review/diffProvider';
import { saveFeedback } from '../review/feedbackWriter';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';

const _diffProvider = new DiffProvider();
const _reviewManager = new ReviewManager(_diffProvider);

function resolveSpecId(item?: SpecTreeItem): string | undefined {
  if (item?.kind === 'spec') return item.spec.spec_id;
  return undefined;
}

export function createReviewSpecCommand(_refresh: () => void) {
  return async (item?: SpecTreeItem): Promise<void> => {
    const specId = resolveSpecId(item);
    if (!specId) {
      vscode.window.showErrorMessage('No spec selected. Right-click a spec in the sidebar.');
      return;
    }
    await _reviewManager.openReview(specId);
  };
}

export function createApproveSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem): Promise<void> => {
    const specId = resolveSpecId(item);
    if (!specId) {
      vscode.window.showErrorMessage('No spec selected.');
      return;
    }
    try {
      await _reviewManager.submitDecision(specId, 'approve');
      refresh();
      vscode.window.showInformationMessage(`${specId} approved — ready for GitHub flow.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Approve failed: ${message}`);
    }
  };
}

export function createRequestChangesCommand(refresh: () => void) {
  return async (item?: SpecTreeItem): Promise<void> => {
    const specId = resolveSpecId(item);
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
  return async (item?: SpecTreeItem): Promise<void> => {
    const specId = resolveSpecId(item);
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

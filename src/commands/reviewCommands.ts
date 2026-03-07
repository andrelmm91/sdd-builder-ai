import * as vscode from 'vscode';
import { ReviewManager } from '../review/reviewManager';
import { DiffProvider } from '../review/diffProvider';
import { saveFeedback } from '../review/feedbackWriter';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import { createBranch, stageFiles, commit, push, getChangedFiles } from '../github/gitOps';
import { createPullRequest, linkPrToExecution } from '../github/prCreator';
import { parseFrontmatter } from '../utils/frontmatter';
import { readWorkspaceFile, listFiles } from '../utils/fileSystem';
import { parseSpec } from '../specs/parser';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import type { SpecDocument } from '../specs/types';

const _diffProvider = new DiffProvider();
const _reviewManager = new ReviewManager(_diffProvider);

function resolveSpecId(item?: SpecTreeItem): string | undefined {
  if (item?.kind === 'spec') return item.spec.spec_id;
  return undefined;
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

async function findAndParseSpec(specId: string): Promise<SpecDocument | undefined> {
  const pattern = `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`;
  const files = await listFiles(pattern);
  for (const file of files) {
    const content = await readWorkspaceFile(file);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      if (data['spec_id'] === specId) {
        const parsed = parseSpec(content);
        if (parsed.success) return parsed.data;
      }
    } catch {
      // skip unparseable files
    }
  }
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

    // 1. Confirm with user before any destructive action
    const confirmed = await vscode.window.showInformationMessage(
      `Approve ${specId} and create a PR?`,
      { modal: true },
      'Approve & Create PR'
    );
    if (confirmed !== 'Approve & Create PR') return;

    // 2. Load spec data before making any changes
    const specDoc = await findAndParseSpec(specId);
    if (!specDoc) {
      vscode.window.showErrorMessage(`Spec file not found for ${specId}.`);
      return;
    }

    const specTitle = specDoc.frontmatter.title;
    const slug = toSlug(specTitle);
    const branchName = `sdd/${specId}-${slug}`;

    // 3. Warn if working tree has uncommitted changes
    const dirtyFiles = await getChangedFiles();
    if (dirtyFiles.length > 0) {
      const proceed = await vscode.window.showWarningMessage(
        `You have ${dirtyFiles.length} uncommitted file(s). They will be committed as part of this spec. Continue?`,
        { modal: true },
        'Continue'
      );
      if (proceed !== 'Continue') return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Shipping ${specId}`,
        cancellable: false,
      },
      async (progress) => {
        try {
          // 4. Create branch — abort if this fails so spec stays in "review"
          progress.report({ message: 'Creating branch…', increment: 15 });
          const branchResult = await createBranch(specId, slug);
          if (!branchResult.success) {
            vscode.window.showErrorMessage(
              `Branch creation failed: ${branchResult.error}. Spec remains in review.`
            );
            return;
          }

          // 5. Transition spec to "done"
          progress.report({ message: 'Approving spec…', increment: 25 });
          try {
            await _reviewManager.submitDecision(specId, 'approve');
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Approve failed: ${message}`);
            return;
          }
          refresh();

          // 6. Stage all changed files (includes the updated spec file)
          progress.report({ message: 'Staging files…', increment: 45 });
          const filesToStage = await getChangedFiles();
          if (filesToStage.length > 0) {
            const stageResult = await stageFiles(filesToStage);
            if (!stageResult.success) {
              vscode.window.showErrorMessage(`Staging failed: ${stageResult.error}`);
              return;
            }
          }

          // 7. Commit with spec-derived message
          progress.report({ message: 'Committing…', increment: 60 });
          const commitResult = await commit(specId, specTitle);
          if (!commitResult.success) {
            vscode.window.showErrorMessage(`Commit failed: ${commitResult.error}`);
            return;
          }

          // 8. Push to remote, offer retry on failure
          progress.report({ message: 'Pushing to remote…', increment: 75 });
          let pushResult = await push(branchName);
          if (!pushResult.success) {
            const choice = await vscode.window.showWarningMessage(
              `Push failed: ${pushResult.error}`,
              'Retry',
              'Skip'
            );
            if (choice === 'Retry') {
              pushResult = await push(branchName);
              if (!pushResult.success) {
                vscode.window.showErrorMessage(`Push failed again: ${pushResult.error}`);
                return;
              }
            } else {
              vscode.window.showInformationMessage(
                `${specId} approved and committed locally. Push skipped.`
              );
              return;
            }
          }

          // 9. Create PR via prCreator
          progress.report({ message: 'Creating pull request…', increment: 88 });
          const requirements = specDoc.functionalRequirements
            .split('\n')
            .filter((l) => l.trim().startsWith('-'))
            .map((l) => l.replace(/^-\s*/, '').trim())
            .filter(Boolean);

          const prResult = await createPullRequest({
            specId,
            title: specTitle,
            context: specDoc.context,
            requirements,
            executionSummary: `Spec ${specId} executed and approved via SDD Platform.`,
            branchName,
          });

          // 10. Save PR URL and show notification
          progress.report({ message: 'Done!', increment: 100 });
          if (prResult.success && prResult.url) {
            await linkPrToExecution(specId, prResult.url);
            const open = await vscode.window.showInformationMessage(
              `PR created: ${prResult.url}`,
              'Open PR'
            );
            if (open === 'Open PR') {
              await vscode.env.openExternal(vscode.Uri.parse(prResult.url));
            }
          } else {
            vscode.window.showWarningMessage(
              `${specId} approved. PR creation failed: ${prResult.error ?? 'gh CLI not available'}. Changes are committed locally.`
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Ship failed: ${message}`);
        }
      }
    );
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

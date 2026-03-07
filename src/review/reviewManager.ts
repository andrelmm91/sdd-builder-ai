import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import {
  readWorkspaceFile,
  writeWorkspaceFile,
  listFiles,
  getWorkspaceRoot,
} from '../utils/fileSystem';
import { execCommand } from '../utils/shell';
import { canTransition } from '../specs/lifecycle';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION, REVIEWS_FOLDER } from '../utils/constants';
import type { SpecStatus } from '../specs/types';
import type { ReviewDecision, ReviewRecord } from './types';
import { DiffProvider } from './diffProvider';

// Tracks specIds currently having a decision submitted to prevent concurrent submissions.
const _submittingReviews = new Set<string>();

export class ReviewManager {
  private readonly _diffProvider: DiffProvider;

  constructor(diffProvider?: DiffProvider) {
    this._diffProvider = diffProvider ?? new DiffProvider();
  }

  /**
   * Opens the review split view: spec file on the left, git diffs on the right.
   */
  async openReview(specId: string): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder is open.');
      return;
    }

    const specPath = await findSpecFile(specId);
    if (!specPath) {
      vscode.window.showErrorMessage(`Spec file not found for: ${specId}`);
      return;
    }

    const specUri = vscode.Uri.file(path.join(root, specPath));
    await vscode.commands.executeCommand('vscode.open', specUri, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });

    await this._diffProvider.openAllDiffs();
  }

  /**
   * Processes a review decision atomically: updates spec status and saves the review record.
   *
   * - approve    → spec transitions to "done"
   * - request_changes → spec transitions to "ready", feedback saved
   * - reject     → user confirmed, changes reverted, spec transitions to "draft"
   */
  async submitDecision(
    specId: string,
    decision: ReviewDecision,
    feedback?: string
  ): Promise<void> {
    if (_submittingReviews.has(specId)) {
      vscode.window.showWarningMessage(
        `A review for ${specId} is already being submitted.`
      );
      return;
    }

    _submittingReviews.add(specId);
    try {
      const root = getWorkspaceRoot();
      if (!root) throw new Error('No workspace folder is open.');

      const specPath = await findSpecFile(specId);
      if (!specPath) throw new Error(`Spec file not found for: ${specId}`);

      const content = await readWorkspaceFile(specPath);
      if (!content) throw new Error(`Could not read spec file: ${specPath}`);

      const { data, body } = parseFrontmatter(content);
      const currentStatus = data['status'] as SpecStatus;

      const targetStatus: SpecStatus =
        decision === 'approve'
          ? 'done'
          : decision === 'request_changes'
            ? 'ready'
            : 'draft';

      if (!canTransition(currentStatus, targetStatus)) {
        throw new Error(
          `Cannot transition ${specId} from '${currentStatus}' to '${targetStatus}'.`
        );
      }

      // For reject: warn the user and revert all changed files.
      if (decision === 'reject') {
        const confirmed = await vscode.window.showWarningMessage(
          `Rejecting ${specId} will revert all uncommitted changes. This cannot be undone. Continue?`,
          { modal: true },
          'Reject & Revert'
        );
        if (confirmed !== 'Reject & Revert') return;

        const changedFiles = await this._diffProvider.getChangedFiles();
        if (changedFiles.length > 0) {
          const fileArgs = changedFiles.map((f) => `"${f.path}"`).join(' ');
          await execCommand(`git checkout HEAD -- ${fileArgs}`, { cwd: root });
        }
      }

      // Atomic: update spec status + persist review record.
      data['status'] = targetStatus;
      const updatedContent = serializeFrontmatter(data, body);
      await writeWorkspaceFile(specPath, updatedContent);

      await saveReviewRecord(specId, decision, feedback);
    } finally {
      _submittingReviews.delete(specId);
    }
  }

  /**
   * Reads all review records for a spec in ascending order by review number.
   */
  async getReviewHistory(specId: string): Promise<ReviewRecord[]> {
    const pattern = `${REVIEWS_FOLDER}/${specId}/review-*.json`;
    const files = await listFiles(pattern);

    const records: ReviewRecord[] = [];
    for (const file of files.sort()) {
      const content = await readWorkspaceFile(file);
      if (content) {
        try {
          records.push(JSON.parse(content) as ReviewRecord);
        } catch {
          // skip malformed records
        }
      }
    }

    return records.sort((a, b) => a.reviewNumber - b.reviewNumber);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function findSpecFile(specId: string): Promise<string | undefined> {
  const pattern = `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`;
  const files = await listFiles(pattern);
  for (const file of files) {
    const content = await readWorkspaceFile(file);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      if (data['spec_id'] === specId) return file;
    } catch {
      // skip unparseable files
    }
  }
  return undefined;
}

async function saveReviewRecord(
  specId: string,
  decision: ReviewDecision,
  feedback?: string
): Promise<void> {
  const pattern = `${REVIEWS_FOLDER}/${specId}/review-*.json`;
  const existing = await listFiles(pattern);

  let reviewNumber = 1;
  if (existing.length > 0) {
    const nums = existing
      .map((f) => {
        const m = /review-(\d+)\.json$/.exec(f);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => n > 0);
    if (nums.length > 0) reviewNumber = Math.max(...nums) + 1;
  }

  let reviewer = 'unknown';
  const root = getWorkspaceRoot();
  if (root) {
    const gitUser = await execCommand('git config user.name', { cwd: root });
    reviewer = gitUser.success && gitUser.stdout.trim()
      ? gitUser.stdout.trim()
      : os.userInfo().username;
  }

  const paddedNum = String(reviewNumber).padStart(3, '0');
  const record: ReviewRecord = {
    specId,
    reviewNumber,
    timestamp: new Date().toISOString(),
    decision,
    ...(feedback !== undefined ? { feedback } : {}),
    reviewer,
  };

  await writeWorkspaceFile(
    `${REVIEWS_FOLDER}/${specId}/review-${paddedNum}.json`,
    JSON.stringify(record, null, 2)
  );
}

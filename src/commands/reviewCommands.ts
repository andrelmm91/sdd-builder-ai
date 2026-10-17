import * as vscode from 'vscode';
import { ReviewManager } from '../review/reviewManager';
import { DiffProvider } from '../review/diffProvider';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import * as path from 'path';
import { getWorkspaceRoot, writeWorkspaceFile, listFiles, readWorkspaceFile } from '../utils/fileSystem';
import { EXECUTIONS_FOLDER, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { getLatestExecution } from '../execution/resultCapture';
import { restoreCheckpoint } from '../execution/gitCheckpoint';

const _diffProvider = new DiffProvider();
const _reviewManager = new ReviewManager(_diffProvider);

interface ResolvedSpec {
  specId: string;
  filePath: string;
}

interface SpecEntry extends ResolvedSpec {
  title: string;
  status: string;
}

/** Lists all specs in the workspace with their absolute file paths. */
async function listSpecEntries(): Promise<SpecEntry[]> {
  const root = getWorkspaceRoot();
  if (!root) return [];
  const entries: SpecEntry[] = [];
  for (const file of await listFiles(`${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`)) {
    const content = await readWorkspaceFile(file);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      if (!data['spec_id']) continue;
      entries.push({
        specId: data['spec_id'] as string,
        filePath: path.join(root, file),
        title: (data['title'] as string) ?? '',
        status: (data['status'] as string) ?? '',
      });
    } catch { /* skip unparseable files */ }
  }
  return entries;
}

/**
 * Resolves the target spec from a sidebar item, a spec file path or a spec ID (e.g. from the Kanban board).
 * With no argument (command palette), asks the user to pick a spec whose status is in `pickStatuses`.
 */
export async function resolveSpec(
  item: SpecTreeItem | string | undefined,
  pickStatuses: string[] = ['review']
): Promise<ResolvedSpec | undefined> {
  if (item && typeof item === 'object' && item.kind === 'spec') {
    return { specId: item.spec.spec_id, filePath: item.filePath };
  }

  if (typeof item === 'string' && item.trim()) {
    if (item.endsWith(SPEC_FILE_EXTENSION) || /[\\/]/.test(item)) {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(item));
        const { data } = parseFrontmatter(Buffer.from(bytes).toString('utf8'));
        if (data['spec_id']) return { specId: data['spec_id'] as string, filePath: item };
      } catch { /* fall through */ }
      return undefined;
    }
    return (await listSpecEntries()).find((s) => s.specId === item);
  }

  const candidates = (await listSpecEntries()).filter((s) => pickStatuses.includes(s.status));
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(`No specs in ${pickStatuses.join(' or ')}.`);
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((s) => ({ label: s.specId, description: s.title, spec: s })),
    { placeHolder: 'Select a spec' }
  );
  return picked?.spec;
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
  let newBody: string;
  const contextMatch = /^## Context\b/m.exec(body);
  if (contextMatch) {
    const afterContext = body.slice(contextMatch.index + contextMatch[0].length);
    const nextHeadingMatch = /\n## /.exec(afterContext);
    if (nextHeadingMatch) {
      const insertAt = contextMatch.index + contextMatch[0].length + nextHeadingMatch.index;
      const before = body.slice(0, insertAt).trimEnd();
      const after = body.slice(insertAt).trimStart();
      newBody = `${before}\n\nFeedback for re-execution: ${feedback}\n\n${after}`;
    } else {
      newBody = `${body.trimEnd()}\n\nFeedback for re-execution: ${feedback}`;
    }
  } else {
    newBody = `${body.trimEnd()}\n\nFeedback for re-execution: ${feedback}`;
  }

  const updated = serializeFrontmatter({ ...data, status: 'ready' }, newBody);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));

  // Keep the AI's changes and make the next run reuse the original checkpoint.
  await markReuseCheckpoint(data['spec_id'] as string | undefined);
}

/** Flags the latest execution record so the next run keeps its checkpoint (cumulative re-runs). */
async function markReuseCheckpoint(specId: string | undefined): Promise<void> {
  if (!specId) return;
  const latest = await getLatestExecution(specId);
  if (!latest) return;
  const padded = String(latest.executionNumber).padStart(3, '0');
  await writeWorkspaceFile(
    `${EXECUTIONS_FOLDER}/${specId}/exec-${padded}.json`,
    JSON.stringify({ ...latest, reuseCheckpointOnNextRun: true }, null, 2)
  );
}

/**
 * Reverts the files changed by the latest execution of `specId` to their state at its checkpoint.
 * Asks for confirmation unless `options.confirm` is `false`. Returns true if any file was restored or deleted.
 */
export async function discardExecutionChanges(
  specId: string,
  options?: { confirm?: boolean }
): Promise<boolean> {
  const record = await getLatestExecution(specId);
  if (!record?.checkpoint) {
    vscode.window.showWarningMessage(
      `No checkpoint available for ${specId}; changes cannot be discarded automatically.`
    );
    return false;
  }

  const changedFiles = record.changedFiles ?? [];
  if (options?.confirm !== false) {
    const answer = await vscode.window.showWarningMessage(
      `Discard ${changedFiles.length} file change(s) made by the AI for ${specId}? This cannot be undone.`,
      { modal: true },
      'Discard'
    );
    if (answer !== 'Discard') return false;
  }

  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('No workspace folder is open.');
    return false;
  }

  const result = await restoreCheckpoint(record.checkpoint, changedFiles, root);
  const count = result.restored.length + result.deleted.length;
  if (result.skipped.length > 0) {
    vscode.window.showWarningMessage(
      `Discarded ${count} file(s) for ${specId}; could not revert: ${result.skipped
        .map((s) => `${s.path} (${s.reason})`)
        .join(', ')}`
    );
  } else {
    vscode.window.showInformationMessage(`Discarded ${count} file change(s) for ${specId}.`);
  }
  if (result.headMoved) {
    vscode.window.showWarningMessage(
      'The AI created commit(s) after the checkpoint. Files were restored, but the commits remain; use git to remove them if needed.'
    );
  }
  return count > 0;
}


/** Like `resolveSpec`, but reports an error when an explicit argument cannot be resolved. */
async function resolveSpecOrReport(
  item: SpecTreeItem | string | undefined,
  pickStatuses?: string[]
): Promise<ResolvedSpec | undefined> {
  const spec = await resolveSpec(item, pickStatuses);
  if (!spec && item !== undefined) {
    vscode.window.showErrorMessage(
      typeof item === 'string' ? `Spec not found: ${item}` : 'No spec selected.'
    );
  }
  return spec;
}

export function createReviewSpecCommand(_refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const spec = await resolveSpecOrReport(item, ['in_progress', 'review']);
    if (!spec) return;
    const { specId } = spec;
    await _reviewManager.openReview(specId);
  };
}

export function createApproveSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const spec = await resolveSpecOrReport(item);
    if (!spec) return;
    const { specId } = spec;

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
    const spec = await resolveSpecOrReport(item);
    if (!spec) return;
    const { specId, filePath } = spec;

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

export function createDiscardChangesCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const spec = await resolveSpecOrReport(item);
    if (!spec) return;
    const { specId } = spec;
    try {
      if (await discardExecutionChanges(specId)) refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Discard failed: ${message}`);
    }
  };
}

export function createRejectSpecCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    const spec = await resolveSpecOrReport(item);
    if (!spec) return;
    const { specId } = spec;
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

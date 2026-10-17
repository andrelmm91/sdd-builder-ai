import * as fs from 'fs/promises';
import * as path from 'path';
import { execCommand } from '../utils/shell';
import type { ExecResult } from '../utils/shell';
import { quoteForShell } from '../utils/shellQuote';
import type { GitCheckpoint, RestoreResult } from './types';

export type ExecFn = (cmd: string, opts: { cwd: string }) => Promise<ExecResult>;

const LIST_UNTRACKED = 'git -c core.quotepath=off ls-files --others --exclude-standard';

function toLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Snapshots the git state without touching the working tree, index or stash list.
 * Returns undefined when `root` is not a git repository or git is unavailable.
 */
export async function createCheckpoint(
  root: string,
  exec: ExecFn = execCommand,
): Promise<GitCheckpoint | undefined> {
  const head = await exec('git rev-parse HEAD', { cwd: root });
  const headSha = head.stdout.trim();
  if (!head.success || !headSha) {
    console.warn(`[SDD] Git checkpoint skipped: not a git repository or git unavailable (${root})`);
    return undefined;
  }

  // `git stash create` writes a commit object but does not push to the stash list; empty output = clean tree
  const stash = await exec('git stash create', { cwd: root });
  const stashSha = stash.success ? stash.stdout.trim() : '';

  const untracked = await exec(LIST_UNTRACKED, { cwd: root });
  if (!untracked.success) {
    console.warn(`[SDD] Git checkpoint skipped: could not list untracked files (${untracked.stderr.trim()})`);
    return undefined;
  }

  return {
    headSha,
    baseSha: stashSha || headSha,
    untrackedBefore: toLines(untracked.stdout).map(normalizePath),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns `"<STATUS> <path>"` entries (A/M/D/R) for everything changed since the checkpoint,
 * including AI commits and new untracked files, excluding pre-existing changes.
 */
export async function getChangesSince(
  cp: GitCheckpoint,
  root: string,
  exec: ExecFn = execCommand,
): Promise<string[]> {
  const entries = new Map<string, string>();

  const diff = await exec(`git -c core.quotepath=off diff --name-status -M ${cp.baseSha}`, { cwd: root });
  if (diff.success) {
    for (const line of toLines(diff.stdout)) {
      const [rawStatus, ...paths] = line.split('\t');
      const status = rawStatus.charAt(0);
      const path = paths[paths.length - 1]; // renames/copies list old then new path
      if (!status || !path) { continue; }
      entries.set(normalizePath(path), status);
    }
  }

  const untracked = await exec(LIST_UNTRACKED, { cwd: root });
  if (untracked.success) {
    const before = new Set(cp.untrackedBefore.map(normalizePath));
    for (const file of toLines(untracked.stdout).map(normalizePath)) {
      if (!before.has(file) && !entries.has(file)) {
        entries.set(file, 'A');
      }
    }
  }

  return [...entries].map(([file, status]) => `${status} ${file}`);
}

async function restoreFromBase(
  cp: GitCheckpoint,
  file: string,
  root: string,
  exec: ExecFn,
): Promise<string | undefined> {
  const q = quoteForShell(file);
  const checkout = await exec(`git checkout ${cp.baseSha} -- ${q}`, { cwd: root });
  if (!checkout.success) { return checkout.stderr.trim() || 'git checkout failed'; }
  const reset = await exec(`git reset -q -- ${q}`, { cwd: root });
  if (!reset.success) { return reset.stderr.trim() || 'git reset failed'; }
  return undefined;
}

async function existedAtBase(cp: GitCheckpoint, file: string, root: string, exec: ExecFn): Promise<boolean> {
  const res = await exec(`git cat-file -e ${quoteForShell(`${cp.baseSha}:${file}`)}`, { cwd: root });
  return res.success;
}

async function deleteFromDisk(file: string, root: string, exec: ExecFn): Promise<void> {
  await exec(`git reset -q -- ${quoteForShell(file)}`, { cwd: root });
  await fs.rm(path.join(root, file), { force: true });
}

/** Maps renamed (new) paths to their old path, as seen from the checkpoint base. */
async function findRenameSources(cp: GitCheckpoint, root: string, exec: ExecFn): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  const diff = await exec(`git -c core.quotepath=off diff --name-status -M ${cp.baseSha}`, { cwd: root });
  if (!diff.success) { return sources; }
  for (const line of toLines(diff.stdout)) {
    const [rawStatus, oldPath, newPath] = line.split('\t');
    if (rawStatus.startsWith('R') && oldPath && newPath) {
      sources.set(normalizePath(newPath), normalizePath(oldPath));
    }
  }
  return sources;
}

/**
 * Reverts only the files in `changedFiles` (`"<STATUS> <path>"`) to their state at the checkpoint.
 * Never resets HEAD or touches other files; commits made by the AI are left in place (`headMoved`).
 */
export async function restoreCheckpoint(
  cp: GitCheckpoint,
  changedFiles: string[],
  root: string,
  exec: ExecFn = execCommand,
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: [], deleted: [], skipped: [], headMoved: false };

  const head = await exec('git rev-parse HEAD', { cwd: root });
  result.headMoved = head.success && head.stdout.trim() !== cp.headSha;

  const renameSources = changedFiles.some((entry) => entry.startsWith('R'))
    ? await findRenameSources(cp, root, exec)
    : new Map<string, string>();

  const restore = async (file: string): Promise<boolean> => {
    const error = await restoreFromBase(cp, file, root, exec);
    if (error) { result.skipped.push({ path: file, reason: error }); return false; }
    result.restored.push(file);
    return true;
  };

  for (const entry of changedFiles) {
    const status = entry.charAt(0);
    const file = normalizePath(entry.slice(1).trim());
    if (!file) { continue; }

    try {
      if (status === 'M' || status === 'D') {
        await restore(file);
      } else if (status === 'A') {
        if (await existedAtBase(cp, file, root, exec)) {
          await restore(file);
        } else {
          await deleteFromDisk(file, root, exec);
          result.deleted.push(file);
        }
      } else if (status === 'R') {
        const oldPath = renameSources.get(file);
        if (!oldPath) {
          result.skipped.push({ path: file, reason: 'could not determine the original path of the rename' });
        } else if (await restore(oldPath)) {
          await deleteFromDisk(file, root, exec);
          result.deleted.push(file);
        }
      } else {
        result.skipped.push({ path: file, reason: `unsupported status "${status}"` });
      }
    } catch (err) {
      result.skipped.push({ path: file, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

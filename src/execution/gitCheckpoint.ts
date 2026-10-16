import { execCommand } from '../utils/shell';
import type { ExecResult } from '../utils/shell';
import type { GitCheckpoint } from './types';

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

  return [...entries].map(([path, status]) => `${status} ${path}`);
}

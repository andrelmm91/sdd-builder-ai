import { execCommand } from '../utils/shell';
import { getWorkspaceRoot } from '../utils/fileSystem';

export type GitResult = { success: boolean; output: string; error?: string };

export async function createBranch(specId: string, slug: string): Promise<GitResult> {
  const cwd = getWorkspaceRoot();
  const branchName = `sdd/${specId}-${slug}`;

  // Warn if working tree is dirty
  const statusResult = await execCommand('git status --porcelain', { cwd });
  if (statusResult.success && statusResult.stdout.trim()) {
    console.warn('[SDD] Working tree has uncommitted changes before branch creation');
  }

  const result = await execCommand(`git checkout -b ${branchName}`, { cwd });
  if (!result.success) {
    if (result.stderr.includes('already exists')) {
      const suffixed = `${branchName}-2`;
      const r2 = await execCommand(`git checkout -b ${suffixed}`, { cwd });
      return toGitResult(r2);
    }
    return toGitResult(result);
  }
  return toGitResult(result);
}

export async function stageFiles(files: string[]): Promise<GitResult> {
  const cwd = getWorkspaceRoot();
  const args = files.map((f) => `"${f}"`).join(' ');
  const result = await execCommand(`git add ${args}`, { cwd });
  return toGitResult(result);
}

export async function commit(specId: string, title: string): Promise<GitResult> {
  const cwd = getWorkspaceRoot();
  const message = `feat: ${title} (${specId})`;
  const result = await execCommand(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
  return toGitResult(result);
}

export async function push(branchName: string): Promise<GitResult> {
  const cwd = getWorkspaceRoot();
  const result = await execCommand(`git push -u origin ${branchName}`, { cwd });
  if (!result.success) {
    const stderr = result.stderr;
    let error: string;
    if (/no such remote|remote '?origin'? not found|does not appear to be a git repository/i.test(stderr)) {
      error = 'Push failed: no remote named "origin". Configure a remote first.';
    } else if (/Authentication failed|could not read Username|Permission denied/i.test(stderr)) {
      error = 'Push failed: authentication error. Check your Git credentials.';
    } else {
      error = stderr.trim() || 'Push failed for unknown reason.';
    }
    return { success: false, output: result.stdout.trim(), error };
  }
  return toGitResult(result);
}

export async function getCurrentBranch(): Promise<string> {
  const cwd = getWorkspaceRoot();
  const result = await execCommand('git rev-parse --abbrev-ref HEAD', { cwd });
  return result.stdout.trim();
}

export async function getChangedFiles(): Promise<string[]> {
  const cwd = getWorkspaceRoot();
  const result = await execCommand('git status --porcelain', { cwd });
  if (!result.success) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\S+\s+/, ''));
}

export async function checkoutFiles(files: string[]): Promise<GitResult> {
  const cwd = getWorkspaceRoot();
  const args = files.map((f) => `"${f}"`).join(' ');
  const result = await execCommand(`git checkout -- ${args}`, { cwd });
  return toGitResult(result);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGitResult(result: { success: boolean; stdout: string; stderr: string }): GitResult {
  return {
    success: result.success,
    output: result.stdout.trim(),
    ...(result.success ? {} : { error: result.stderr.trim() }),
  };
}

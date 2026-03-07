import * as vscode from 'vscode';
import * as path from 'path';
import { execCommand } from '../utils/shell';
import { getWorkspaceRoot } from '../utils/fileSystem';

export type ChangedFile = { path: string; status: 'added' | 'modified' | 'deleted' };

export class DiffProvider {
  /**
   * Runs `git diff --name-status HEAD` and returns the list of changed files with their change type.
   */
  async getChangedFiles(): Promise<ChangedFile[]> {
    const root = getWorkspaceRoot();
    if (!root) return [];

    const result = await execCommand('git diff --name-status HEAD', { cwd: root });
    if (!result.success || !result.stdout.trim()) return [];

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line): ChangedFile[] => {
        const parts = line.split('\t');
        const statusCode = parts[0]?.charAt(0).toUpperCase();
        const filePath = parts[parts.length - 1];
        if (!filePath || !statusCode) return [];

        let status: ChangedFile['status'];
        if (statusCode === 'A') status = 'added';
        else if (statusCode === 'D') status = 'deleted';
        else status = 'modified';

        return [{ path: filePath, status }];
      });
  }

  /**
   * Opens VS Code's native diff view for a single file (HEAD vs working tree).
   * For added files, diffs against the HEAD empty ref. Skips binary files.
   */
  async openDiffForFile(filePath: string): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) return;

    const absolutePath = path.join(root, filePath);
    const workingUri = vscode.Uri.file(absolutePath);
    const title = `${path.basename(filePath)} (HEAD \u2194 Working Tree)`;

    // Skip binary files
    const binaryCheck = await execCommand(
      `git diff --numstat HEAD -- "${filePath}"`,
      { cwd: root }
    );
    if (binaryCheck.success && binaryCheck.stdout.startsWith('-\t-\t')) {
      vscode.window.showInformationMessage(`${filePath}: binary file \u2014 diff skipped`);
      await vscode.commands.executeCommand('vscode.open', workingUri);
      return;
    }

    // Use the git extension's URI scheme to access HEAD content.
    // For added files the HEAD ref simply won't exist, which VS Code renders as empty.
    const headUri = workingUri.with({
      scheme: 'git',
      query: JSON.stringify({ path: absolutePath, ref: 'HEAD' }),
    });

    await vscode.commands.executeCommand('vscode.diff', headUri, workingUri, title);
  }

  /**
   * Opens diff views for all changed files in separate tabs.
   */
  async openAllDiffs(): Promise<void> {
    const files = await this.getChangedFiles();
    for (const file of files) {
      await this.openDiffForFile(file.path);
    }
  }

  /**
   * Returns changed files that are outside `specRelevantFiles` or are listed in `specMustNotTouch`.
   */
  async getScopeViolations(
    specRelevantFiles: string[],
    specMustNotTouch: string[]
  ): Promise<ChangedFile[]> {
    const changed = await this.getChangedFiles();
    return changed.filter(
      (file) => !specRelevantFiles.includes(file.path) || specMustNotTouch.includes(file.path)
    );
  }
}

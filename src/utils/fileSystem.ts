import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Returns the absolute path of the workspace root, or undefined if no workspace is open.
 */
export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Reads a file relative to the workspace root.
 * Returns undefined if the workspace root is unavailable or the file does not exist.
 */
export async function readWorkspaceFile(relativePath: string): Promise<string | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    return undefined;
  }

  const uri = vscode.Uri.file(path.join(root, relativePath));
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * Writes content to a file relative to the workspace root, creating parent directories as needed.
 */
export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error('No workspace folder is open');
  }

  const uri = vscode.Uri.file(path.join(root, relativePath));
  const dirUri = vscode.Uri.file(path.dirname(uri.fsPath));

  await vscode.workspace.fs.createDirectory(dirUri);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

/**
 * Globs files in the workspace using VS Code workspace.findFiles.
 * Returns workspace-relative POSIX paths.
 */
export async function listFiles(pattern: string): Promise<string[]> {
  const uris = await vscode.workspace.findFiles(pattern);
  const root = getWorkspaceRoot();
  return uris.map((uri) => {
    if (root) {
      return path.relative(root, uri.fsPath).replace(/\\/g, '/');
    }
    return uri.fsPath;
  });
}

/**
 * Returns true if the file at the given workspace-relative path exists.
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  const root = getWorkspaceRoot();
  if (!root) {
    return false;
  }

  const uri = vscode.Uri.file(path.join(root, relativePath));
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

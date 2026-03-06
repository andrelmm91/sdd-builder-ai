import * as vscode from 'vscode';
import { parseSpec } from '../specs/parser';
import { SPEC_FILE_EXTENSION, SPECS_FOLDER } from '../utils/constants';

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly watcher: vscode.FileSystemWatcher;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBarItem.command = 'sdd.openDashboard';
    this.statusBarItem.show();

    const root = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('');
    const pattern = new vscode.RelativePattern(
      root,
      `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`,
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => this.scheduleUpdate());
    this.watcher.onDidChange(() => this.scheduleUpdate());
    this.watcher.onDidDelete(() => this.scheduleUpdate());

    void this.updateCounts();
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.watcher.dispose();
    this.statusBarItem.dispose();
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.updateCounts();
    }, 500);
  }

  async updateCounts(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.statusBarItem.text = 'SDD: 0 ready, 0 running';
      return;
    }

    const root = workspaceFolders[0].uri;
    const pattern = new vscode.RelativePattern(
      root,
      `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`,
    );
    const uris = await vscode.workspace.findFiles(pattern);

    let readyCount = 0;
    let inProgressCount = 0;

    await Promise.all(
      uris.map(async (uri) => {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString('utf8');
          const result = parseSpec(content);
          if (result.success) {
            if (result.data.frontmatter.status === 'ready') {
              readyCount++;
            } else if (result.data.frontmatter.status === 'in_progress') {
              inProgressCount++;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }),
    );

    this.statusBarItem.text = `SDD: ${readyCount} ready, ${inProgressCount} running`;
  }
}


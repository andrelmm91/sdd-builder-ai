import * as vscode from 'vscode';
import { parseSpec } from '../../specs/parser';
import type { SpecData, SpecStatus } from '../../specs/types';
import { SPEC_FILE_EXTENSION, SPECS_FOLDER, STATUS_ORDER } from '../../utils/constants';
import { SpecGroupItem, SpecTreeItem } from './specTreeItem';

type AnyTreeItem = SpecGroupItem | SpecTreeItem;

export class SpecTreeProvider
  implements vscode.TreeDataProvider<AnyTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    AnyTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private specs: SpecData[] = [];
  private readonly specFilePaths = new Map<string, string>();
  private readonly watcher: vscode.FileSystemWatcher;

  constructor() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('');
    const pattern = new vscode.RelativePattern(
      root,
      `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`,
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  dispose(): void {
    this.watcher.dispose();
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AnyTreeItem): Promise<AnyTreeItem[]> {
    if (!element) {
      await this.loadSpecs();
      return this.buildGroupItems();
    }

    if (element instanceof SpecGroupItem) {
      return this.getSpecsForGroup(element.status);
    }

    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private async loadSpecs(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.specs = [];
      return;
    }

    const root = workspaceFolders[0].uri;
    const pattern = new vscode.RelativePattern(
      root,
      `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`,
    );
    const uris = await vscode.workspace.findFiles(pattern, null);

    const results: SpecData[] = [];
    this.specFilePaths.clear();

    await Promise.all(
      uris.map(async (uri) => {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString('utf8');
          const result = parseSpec(content);
          if (result.success) {
            results.push(result.data.frontmatter);
            this.specFilePaths.set(result.data.frontmatter.spec_id, uri.fsPath);
          }
        } catch {
          // Skip unreadable files
        }
      }),
    );

    this.specs = results;
  }

  private buildGroupItems(): SpecGroupItem[] {
    return STATUS_ORDER
      .map((status) => {
        const count = this.specs.filter((s) => s.status === status).length;
        return new SpecGroupItem(status, count);
      })
      .filter((group) => group.count > 0);
  }

  private getSpecsForGroup(status: SpecStatus): SpecTreeItem[] {
    return this.specs
      .filter((s) => s.status === status)
      .sort((a, b) => a.spec_id.localeCompare(b.spec_id))
      .map((spec) => {
        const filePath = this.specFilePaths.get(spec.spec_id) ?? '';
        return new SpecTreeItem(spec, filePath);
      });
  }
}

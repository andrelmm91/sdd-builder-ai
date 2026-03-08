import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { parseSpec } from '../../../specs/parser';
import { getExecutionHistory } from '../../../execution/resultCapture';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../../../utils/constants';
import type { SpecData } from '../../../specs/types';
import type { ExecutionRecord } from '../../../execution/types';

export interface DashboardData {
  specs: SpecData[];
  executions: ExecutionRecord[];
  totalCost: number;
  totalTokens: number;
}

export class DashboardPanel extends BaseWebviewPanel {
  private static instance: DashboardPanel | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (DashboardPanel.instance) {
      DashboardPanel.instance.reveal(vscode.ViewColumn.One);
      return;
    }
    DashboardPanel.instance = new DashboardPanel(extensionUri);
  }

  private constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'sddDashboard', 'SDD Dashboard', vscode.ViewColumn.One);
    this.setupWatcher();
    void this.sendData();
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    if (message.type === 'navigate') {
      const data = message.data as { specId?: string };
      if (data.specId) {
        await this.openSpec(data.specId);
      }
    } else if (message.type === 'openKanban') {
      await vscode.commands.executeCommand('sdd.openKanbanBoard');
    } else if (message.type === 'refresh') {
      await this.sendData();
    }
  }

  override dispose(): void {
    DashboardPanel.instance = undefined;
    this.watcher?.dispose();
    super.dispose();
  }

  private setupWatcher(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => void this.sendData());
    this.watcher.onDidChange(() => void this.sendData());
    this.watcher.onDidDelete(() => void this.sendData());
  }

  private async sendData(): Promise<void> {
    const specs = await this.loadSpecs();
    const executions = await this.loadAllExecutions(specs);
    const totalCost = executions.reduce((sum, e) => sum + e.cost, 0);
    const totalTokens = executions.reduce((sum, e) => sum + e.tokensIn + e.tokensOut, 0);

    this.post('dashboardData', { specs, executions, totalCost, totalTokens });
  }

  private async loadSpecs(): Promise<SpecData[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return [];
    const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    const uris = await vscode.workspace.findFiles(pattern, null);
    const specs: SpecData[] = [];
    await Promise.all(
      uris.map(async (uri) => {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          const result = parseSpec(Buffer.from(bytes).toString('utf8'));
          if (result.success) specs.push(result.data.frontmatter);
        } catch { /* skip */ }
      }),
    );
    return specs;
  }

  private async loadAllExecutions(specs: SpecData[]): Promise<ExecutionRecord[]> {
    const all: ExecutionRecord[] = [];
    await Promise.all(
      specs.map(async (spec) => {
        try {
          const records = await getExecutionHistory(spec.spec_id);
          all.push(...records);
        } catch { /* skip */ }
      }),
    );
    return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private async openSpec(specId: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    const uris = await vscode.workspace.findFiles(pattern, null);
    for (const uri of uris) {
      if (uri.fsPath.includes(specId)) {
        await vscode.window.showTextDocument(uri);
        return;
      }
    }
  }
}

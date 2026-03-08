import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { parseSpec } from '../../../specs/parser';
import { canTransition } from '../../../specs/lifecycle';
import { serializeFrontmatter, parseFrontmatter } from '../../../utils/frontmatter';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../../../utils/constants';
import type { SpecData, SpecStatus } from '../../../specs/types';

interface CardActionMessage {
  action: 'markReady' | 'execute' | 'approve' | 'requestChanges';
  specId: string;
}

interface KanbanMoveMessage {
  specId: string;
  newStatus: SpecStatus;
}

const ACTION_COMMAND_MAP: Record<CardActionMessage['action'], string> = {
  markReady: 'sdd.markReady',
  execute: 'sdd.executeSpec',
  approve: 'sdd.approveSpec',
  requestChanges: 'sdd.requestChanges',
};

export class KanbanPanel extends BaseWebviewPanel {
  private static instance: KanbanPanel | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private specFilePaths = new Map<string, string>();

  static createOrShow(extensionUri: vscode.Uri): void {
    if (KanbanPanel.instance) {
      KanbanPanel.instance.reveal(vscode.ViewColumn.One);
      return;
    }
    KanbanPanel.instance = new KanbanPanel(extensionUri);
  }

  private constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'sddKanban', 'SDD Kanban', vscode.ViewColumn.One);
    this.setupWatcher();
    void this.sendSpecs();
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    switch (message.type) {
      case 'kanbanMove':
        await this.handleKanbanMove(message.data as KanbanMoveMessage);
        break;
      case 'cardAction':
        await this.handleCardAction(message.data as CardActionMessage);
        break;
      case 'openSpecForm':
        await vscode.commands.executeCommand('sdd.newSpecForm');
        break;
      case 'openFile':
        await this.handleOpenFile((message.data as { specId: string }).specId);
        break;
    }
  }

  override dispose(): void {
    KanbanPanel.instance = undefined;
    this.watcher?.dispose();
    super.dispose();
  }

  private setupWatcher(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => void this.sendSpecs());
    this.watcher.onDidChange(() => void this.sendSpecs());
    this.watcher.onDidDelete(() => void this.sendSpecs());
  }

  private async sendSpecs(): Promise<void> {
    const specs = await this.loadSpecs();
    this.post('specList', { specs });
  }

  private async loadSpecs(): Promise<SpecData[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return [];
    const pattern = new vscode.RelativePattern(root, `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    const uris = await vscode.workspace.findFiles(pattern, null);
    const specs: SpecData[] = [];
    this.specFilePaths.clear();
    await Promise.all(
      uris.map(async (uri) => {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          const result = parseSpec(Buffer.from(bytes).toString('utf8'));
          if (result.success) {
            specs.push(result.data.frontmatter);
            this.specFilePaths.set(result.data.frontmatter.spec_id, uri.fsPath);
          }
        } catch { /* skip */ }
      }),
    );
    return specs.sort((a, b) => a.spec_id.localeCompare(b.spec_id));
  }

  private async handleKanbanMove(msg: KanbanMoveMessage): Promise<void> {
    const filePath = this.specFilePaths.get(msg.specId);
    if (!filePath) {
      this.post('moveError', { specId: msg.specId, message: `Spec ${msg.specId} not found` });
      return;
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const { data, body } = parseFrontmatter(content);
      const currentStatus = data.status as SpecStatus;

      if (!canTransition(currentStatus, msg.newStatus)) {
        this.post('moveError', {
          specId: msg.specId,
          message: `Cannot move ${msg.specId} from '${currentStatus}' to '${msg.newStatus}'`,
        });
        return;
      }

      const updated = serializeFrontmatter({ ...data, status: msg.newStatus }, body);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post('moveError', { specId: msg.specId, message });
    }
  }

  private async handleCardAction(msg: CardActionMessage): Promise<void> {
    const command = ACTION_COMMAND_MAP[msg.action];
    if (!command) return;
    const filePath = this.specFilePaths.get(msg.specId);
    if (!filePath) {
      this.post('moveError', { specId: msg.specId, message: `Spec file not found for ${msg.specId}` });
      return;
    }
    await vscode.commands.executeCommand(command, filePath);
  }

  private async handleOpenFile(specId: string): Promise<void> {
    const filePath = this.specFilePaths.get(specId);
    if (filePath) {
      await vscode.window.showTextDocument(vscode.Uri.file(filePath));
    }
  }
}

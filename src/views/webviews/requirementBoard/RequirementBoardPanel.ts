import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { loadFeatureCards, createFeatureFile } from './featureParser';
import { PRODUCT_FOLDER } from '../../../utils/constants';
import type { FeatureCard, FeatureFormData } from './types';

export class RequirementBoardPanel extends BaseWebviewPanel {
  private static instance: RequirementBoardPanel | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (RequirementBoardPanel.instance) {
      RequirementBoardPanel.instance.reveal(vscode.ViewColumn.One);
      return;
    }
    RequirementBoardPanel.instance = new RequirementBoardPanel(extensionUri);
  }

  private constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'sddRequirementBoard', 'Requirement Board', vscode.ViewColumn.One);
    this.setupWatcher();
    void this.sendFeatureCards();
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    switch (message.type) {
      case 'addFeature':
        await this.handleAddFeature(message.data as FeatureFormData);
        break;
      case 'idealizeRequirements': {
        const { featureName, folderPath } = message.data as { featureName: string; folderPath: string };
        await vscode.commands.executeCommand('sdd.idealizeRequirements', featureName, folderPath);
        break;
      }
      case 'createSddCards': {
        const { featureName, folderPath } = message.data as { featureName: string; folderPath: string };
        await vscode.commands.executeCommand('sdd.createSddCards', featureName, folderPath);
        break;
      }
      case 'requestRequirementBoardData':
        await this.sendFeatureCards();
        break;
      case 'openFile': {
        const { filePath } = message.data as { filePath: string };
        try {
          const uri = vscode.Uri.file(filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to open file: ${msg}`);
        }
        break;
      }
    }
  }

  override dispose(): void {
    RequirementBoardPanel.instance = undefined;
    this.watcher?.dispose();
    super.dispose();
  }

  private setupWatcher(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const pattern = new vscode.RelativePattern(root, `${PRODUCT_FOLDER}/**/*.md`);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => void this.sendFeatureCards());
    this.watcher.onDidChange(() => void this.sendFeatureCards());
    this.watcher.onDidDelete(() => void this.sendFeatureCards());
  }

  private async sendFeatureCards(): Promise<void> {
    const cards = await this.loadCards();
    this.post('requirementBoardData', { features: cards });
  }

  private async loadCards(): Promise<FeatureCard[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return [];
    const productFolderUri = vscode.Uri.joinPath(root, PRODUCT_FOLDER);
    return loadFeatureCards(productFolderUri);
  }

  private async handleAddFeature(formData: FeatureFormData): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const productFolderUri = vscode.Uri.joinPath(root, PRODUCT_FOLDER);
    try {
      await createFeatureFile(productFolderUri, formData);
      await this.sendFeatureCards();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to create feature: ${msg}`);
    }
  }
}

import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { readAIConfig, writeAIConfig, getAvailableTags, getAvailableSkills } from '../../../config/aiConfig';
import { initProject } from '../../../commands/initProject';
import type { AIConfig } from '../../../config/aiConfigTypes';

const outputChannel = vscode.window.createOutputChannel('SDD AI Config');

export class AiConfigPanel extends BaseWebviewPanel {
  private static instance: AiConfigPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (AiConfigPanel.instance) {
      AiConfigPanel.instance.reveal(vscode.ViewColumn.One);
      return;
    }
    AiConfigPanel.instance = new AiConfigPanel(extensionUri);
  }

  private constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'sddAiConfig', 'AI Configuration', vscode.ViewColumn.One);
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    outputChannel.appendLine(`[handleMessage] type="${message.type}"`);
    switch (message.type) {
      case 'requestConfig': {
        const [config, tags, skills] = await Promise.all([
          readAIConfig(),
          getAvailableTags(),
          getAvailableSkills(),
        ]);
        if (config === undefined) {
          this.post('notInitialized', {});
        } else {
          this.post('configData', { config, tags, skills });
        }
        break;
      }
      case 'initProject': {
        await initProject();
        // Re-send config so the panel loads immediately after init
        const [config, tags, skills] = await Promise.all([
          readAIConfig(),
          getAvailableTags(),
          getAvailableSkills(),
        ]);
        if (config !== undefined) {
          this.post('configData', { config, tags, skills });
        }
        break;
      }
      case 'saveConfig': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '(no workspace)';
        outputChannel.appendLine(`[saveConfig] workspace root: ${root}`);
        outputChannel.appendLine(`[saveConfig] writing: ${JSON.stringify(message.data)}`);
        try {
          await writeAIConfig(message.data as AIConfig);
          outputChannel.appendLine(`[saveConfig] write succeeded → ${root}/.sdd/config.json`);
          this.post('saveConfirmed', {});
        } catch (err) {
          outputChannel.appendLine(`[saveConfig] ERROR: ${err}`);
          this.post('saveError', { message: String(err) });
          void vscode.window.showErrorMessage(`Failed to save AI config: ${err}`);
        }
        break;
      }
    }
  }

  override dispose(): void {
    AiConfigPanel.instance = undefined;
    super.dispose();
  }
}

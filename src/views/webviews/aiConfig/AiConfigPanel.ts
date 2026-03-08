import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { readAIConfig, writeAIConfig, getAvailableTags, getAvailableSkills } from '../../../config/aiConfig';
import type { AIConfig } from '../../../config/aiConfigTypes';

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
    super(extensionUri, 'aiConfig', 'AI Configuration', vscode.ViewColumn.One);
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    switch (message.type) {
      case 'requestConfig': {
        const [config, tags, skills] = await Promise.all([
          readAIConfig(),
          getAvailableTags(),
          getAvailableSkills(),
        ]);
        this.post('configData', { config, tags, skills });
        break;
      }
      case 'saveConfig': {
        await writeAIConfig(message.data as AIConfig);
        void vscode.window.showInformationMessage('AI configuration saved');
        break;
      }
    }
  }

  override dispose(): void {
    AiConfigPanel.instance = undefined;
    super.dispose();
  }
}

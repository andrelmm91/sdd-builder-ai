import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { readAIConfig, writeAIConfig, readRequirementsAIConfig, writeRequirementsAIConfig, getAvailableTags, getAvailableSkills } from '../../../config/aiConfig';
import { initProject } from '../../../commands/initProject';
import type { AIConfig, RequirementsAIConfig } from '../../../config/aiConfigTypes';

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
        // Re-send both configs so the panel loads immediately after init
        const [config, tags, skills, reqConfig] = await Promise.all([
          readAIConfig(),
          getAvailableTags(),
          getAvailableSkills(),
          readRequirementsAIConfig(),
        ]);
        if (config !== undefined) {
          this.post('configData', { config, tags, skills });
        }
        if (reqConfig !== undefined) {
          this.post('requirementsConfigData', { config: reqConfig });
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
      case 'requestRequirementsConfig': {
        const reqConfig = await readRequirementsAIConfig();
        if (reqConfig === undefined) {
          this.post('notInitialized', {});
        } else {
          this.post('requirementsConfigData', { config: reqConfig });
        }
        break;
      }
      case 'saveRequirementsConfig': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '(no workspace)';
        outputChannel.appendLine(`[saveRequirementsConfig] workspace root: ${root}`);
        outputChannel.appendLine(`[saveRequirementsConfig] writing: ${JSON.stringify(message.data)}`);
        try {
          await writeRequirementsAIConfig(message.data as RequirementsAIConfig);
          outputChannel.appendLine(`[saveRequirementsConfig] write succeeded → ${root}/.sdd/config.json`);
          this.post('requirementsSaveConfirmed', {});
        } catch (err) {
          outputChannel.appendLine(`[saveRequirementsConfig] ERROR: ${err}`);
          this.post('requirementsSaveError', { message: String(err) });
          void vscode.window.showErrorMessage(`Failed to save Requirements AI config: ${err}`);
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

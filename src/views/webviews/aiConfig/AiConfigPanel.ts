import * as vscode from 'vscode';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { readAIConfig, writeAIConfig, readRequirementsAIConfig, writeRequirementsAIConfig, getAvailableTags, getAvailableSkills, getAvailableProviders, writeAIModels, writeCustomProviders } from '../../../config/aiConfig';
import { initProject } from '../../../commands/initProject';
import type { AIConfig, RequirementsAIConfig } from '../../../config/aiConfigTypes';
import { BUILTIN_PROVIDERS, validateProviderList } from '../../../config/providerTypes';
import type { ProviderDefinition } from '../../../config/providerTypes';
import { buildProviderCommand, formatFileRef } from '../../../execution/providerCommand';
import { isCommandAvailable } from '../../../utils/shell';

const outputChannel = vscode.window.createOutputChannel('SDD AI Config');

interface ProviderPayload {
  id: string;
  label: string;
  models: string[];
  permissionModes: { id: string; label: string; mode: 'batch' | 'interactive' }[];
}

function providerPayload(config: AIConfig): ProviderPayload[] {
  return getAvailableProviders(config).map((p) => ({
    id: p.id,
    label: p.label,
    models: p.models ?? [],
    permissionModes: p.permissionModes.map(({ id, label, mode }) => ({ id, label, mode })),
  }));
}

function modelPayload(config: AIConfig): {
  providers: ProviderPayload[];
  customModels: Record<string, string[]>;
  builtinModels: Record<string, string[]>;
  customProviders: ProviderDefinition[];
  builtinProviders: ProviderDefinition[];
} {
  const providers = providerPayload(config);
  // Definition models without the user's ai.models override.
  const builtinModels = Object.fromEntries(
    getAvailableProviders({ ...config, models: undefined }).map((p) => [p.id, p.models ?? []]),
  );
  return { providers, customModels: config.models ?? {}, builtinModels, customProviders: config.customProviders ?? [], builtinProviders: BUILTIN_PROVIDERS };
}

export class AiConfigPanel extends BaseWebviewPanel {
  private static instance: AiConfigPanel | undefined;
  private readonly binaryCache = new Map<string, Promise<boolean>>();

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
          this.post('configData', { config, tags, skills, ...modelPayload(config) });
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
          this.post('configData', { config, tags, skills, ...modelPayload(config) });
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
      case 'saveModels': {
        try {
          const { models } = message.data as { models: Record<string, string[]> };
          await writeAIModels(models);
          const config = await readAIConfig();
          if (config === undefined) {
            throw new Error('Project not initialized');
          }
          this.post('modelsSaved', modelPayload(config));
          void vscode.window.showInformationMessage('Model lists saved.');
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          outputChannel.appendLine(`[saveModels] ERROR: ${text}`);
          this.post('modelsSaveError', { message: text });
          void vscode.window.showErrorMessage(`Failed to save model lists: ${text}`);
        }
        break;
      }
      case 'validateProvider': {
        const { definition, index, all } = message.data as {
          definition: ProviderDefinition;
          index: number;
          all: ProviderDefinition[];
        };
        const prefix = `[${index}]`;
        const errors = validateProviderList(all)
          .filter((e) => e.path === prefix || e.path.startsWith(`${prefix}.`) || e.path.startsWith(`${prefix}[`))
          .map((e) => ({ path: e.path.slice(prefix.length).replace(/^\./, ''), message: e.message }));
        const previews: { modeId: string; label: string; command: string }[] = [];
        if (errors.length === 0) {
          const prompt = `Read and follow all instructions in ${formatFileRef(definition, '.sdd/executions/SDD-000/prompt.md')}.`;
          for (const pm of definition.permissionModes) {
            const { command } = buildProviderCommand(definition, {
              permissionModeId: pm.id,
              prompt,
              model: definition.models?.[0],
              platform: process.platform,
            });
            previews.push({ modeId: pm.id, label: pm.label, command });
          }
        }
        const binaryFound = await this.isBinaryFound(definition.binary);
        this.post('providerValidation', { index, errors, previews, binaryFound });
        break;
      }
      case 'saveProviders': {
        try {
          const { providers } = message.data as { providers: ProviderDefinition[] };
          await writeCustomProviders(providers);
          const config = await readAIConfig();
          if (config === undefined) {
            throw new Error('Project not initialized');
          }
          this.post('providersSaved', modelPayload(config));
          void vscode.window.showInformationMessage('Custom providers saved.');
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          outputChannel.appendLine(`[saveProviders] ERROR: ${text}`);
          this.post('providersSaveError', { message: text });
          void vscode.window.showErrorMessage(`Failed to save custom providers: ${text}`);
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

  private isBinaryFound(binary: string): Promise<boolean> {
    let found = this.binaryCache.get(binary);
    if (!found) {
      found = isCommandAvailable(binary);
      this.binaryCache.set(binary, found);
    }
    return found;
  }

  override dispose(): void {
    AiConfigPanel.instance = undefined;
    super.dispose();
  }
}

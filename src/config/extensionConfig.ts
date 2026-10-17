import * as vscode from 'vscode';
import { readProjectConfig } from './projectConfig';
import { DEFAULT_BUDGET } from '../utils/constants';
import type { AIConfig } from './aiConfigTypes';
import { resolveProviderBinary, resolveProviderDefinition } from '../execution/providerCommand';

export function getExtensionConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('sdd');
}

/**
 * Returns the spec ID prefix. Async because it falls back to reading `.sdd/config.json`
 * when the VS Code workspace setting is not set.
 */
export async function getSpecPrefix(): Promise<string> {
  const val = getExtensionConfig().get<string>('specPrefix');
  if (val) {
    return val;
  }
  const projectConfig = await readProjectConfig();
  return projectConfig.prefix;
}

/**
 * Returns the test command. Async because it falls back to reading `.sdd/config.json`
 * when the VS Code workspace setting is not set.
 */
export async function getTestCommand(): Promise<string> {
  const val = getExtensionConfig().get<string>('testCommand');
  if (val) {
    return val;
  }
  const projectConfig = await readProjectConfig();
  return projectConfig.testCommand;
}

export function getClaudeCliBinary(): string {
  return getExtensionConfig().get<string>('claudeCliBinary') || 'claude';
}

/**
 * Returns the CLI binary for the configured AI provider (built-in or custom definition).
 * `claudeBinary` is the `sdd.claudeCliBinary` override and only applies to the `claude` provider.
 */
export function getProviderBinary(
  aiConfig: Partial<AIConfig> | undefined,
  claudeBinary: string = getClaudeCliBinary(),
): string {
  return resolveProviderBinary(resolveProviderDefinition(aiConfig), claudeBinary);
}

/** Builds the pre-flight error shown when the provider CLI is missing. */
export function getCliNotFoundMessage(aiConfig: Partial<AIConfig> | undefined, binary: string): string {
  const def = resolveProviderDefinition(aiConfig);
  const label = def.id === 'claude' ? 'Claude' : def.id === 'copilot' ? 'Copilot' : def.label;
  const hint = def.id === 'claude' ? ' (setting: sdd.claudeCliBinary)' : '';
  return `${label} CLI not found: "${binary}". Install it or update your AI configuration.${hint}`;
}

export function getDefaultBudget(): number {
  return getExtensionConfig().get<number>('defaultBudget') || DEFAULT_BUDGET;
}

export function getAutoValidate(): boolean {
  return getExtensionConfig().get<boolean>('autoValidate') ?? true;
}

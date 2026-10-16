import * as vscode from 'vscode';
import { readProjectConfig } from './projectConfig';
import { DEFAULT_BUDGET } from '../utils/constants';
import type { AIConfig } from './aiConfigTypes';

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
 * Returns the CLI binary for the configured AI provider: `gh` for Copilot,
 * the Claude binary otherwise. `claudeBinary` lets callers pass an already-resolved value.
 */
export function getProviderBinary(
  aiConfig: Partial<AIConfig> | undefined,
  claudeBinary: string = getClaudeCliBinary(),
): string {
  return aiConfig?.provider === 'copilot' ? 'gh' : claudeBinary;
}

/** Builds the pre-flight error shown when the provider CLI is missing. */
export function getCliNotFoundMessage(aiConfig: Partial<AIConfig> | undefined, binary: string): string {
  const label = aiConfig?.provider === 'copilot' ? 'Copilot' : 'Claude';
  const hint = aiConfig?.provider === 'copilot' ? '' : ' (setting: sdd.claudeCliBinary)';
  return `${label} CLI not found: "${binary}". Install it or update your AI configuration.${hint}`;
}

export function getDefaultBudget(): number {
  return getExtensionConfig().get<number>('defaultBudget') || DEFAULT_BUDGET;
}

export function getAutoValidate(): boolean {
  return getExtensionConfig().get<boolean>('autoValidate') ?? true;
}

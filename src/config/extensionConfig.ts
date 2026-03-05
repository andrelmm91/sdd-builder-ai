import * as vscode from 'vscode';
import { readProjectConfig } from './projectConfig';
import { DEFAULT_BUDGET } from '../utils/constants';

export function getExtensionConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('sdd');
}

export async function getSpecPrefix(): Promise<string> {
  const val = getExtensionConfig().get<string>('specPrefix');
  if (val) {
    return val;
  }
  const projectConfig = await readProjectConfig();
  return projectConfig.prefix;
}

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

export function getDefaultBudget(): number {
  return getExtensionConfig().get<number>('defaultBudget') || DEFAULT_BUDGET;
}

export function getAutoValidate(): boolean {
  return getExtensionConfig().get<boolean>('autoValidate') ?? true;
}

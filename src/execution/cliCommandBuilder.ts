import type { AIConfig, RequirementsAIConfig } from '../config/aiConfigTypes';

export interface CliCommandOptions {
  cliBinary: string;
  aiConfig?: AIConfig | RequirementsAIConfig;
  /** Raw argument appended at the end of the command (e.g. `"$(cat 'file')"` or `< "file"`). */
  promptArg: string;
  /** When provided, adds `--print --max-tokens <n>` flags (used by CliRunner for captured output). */
  maxTokens?: number;
}

/**
 * Builds a CLI command string from the given options.
 * Handles both the claude and copilot providers, including model, permission mode, and prompt argument.
 */
export function buildCliCommand(options: CliCommandOptions): string {
  const { cliBinary, aiConfig, promptArg, maxTokens } = options;
  const provider = aiConfig?.provider ?? 'claude';

  if (provider === 'copilot') {
    const parts = ['gh', 'copilot', 'suggest'];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'yolo') parts.push('--yolo');
    parts.push('-p', promptArg);
    return parts.join(' ');
  }

  // Claude provider (default)
  const parts = [cliBinary];
  if (maxTokens !== undefined) {
    parts.push('--print', '--max-tokens', String(maxTokens));
  }
  if (aiConfig?.model) parts.push('--model', aiConfig.model);
  if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
    parts.push('--dangerously-skip-permissions');
  } else if (aiConfig?.permissionMode === 'plan') {
    parts.push('--plan');
  }
  parts.push(promptArg);
  return parts.join(' ');
}

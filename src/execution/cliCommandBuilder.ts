import type { AIConfig, RequirementsAIConfig } from '../config/aiConfigTypes';

/** Wraps a string in single quotes, escaping any internal single quotes. */
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export interface CliCommandOptions {
  cliBinary: string;
  aiConfig?: AIConfig | RequirementsAIConfig;
  /** The prompt text to send (will be shell-escaped automatically). */
  prompt: string;
  /** When provided, adds `--max-tokens <n>` alongside `--print` (used by CliRunner for captured output). */
  maxTokens?: number;
}

/**
 * Builds a CLI command string from the given options.
 * Handles both the claude and copilot providers, including model, permission mode, and prompt argument.
 * The prompt is shell-escaped automatically — callers should pass raw text.
 */
export function buildCliCommand(options: CliCommandOptions): string {
  const { cliBinary, aiConfig, prompt, maxTokens } = options;
  const provider = aiConfig?.provider ?? 'claude';

  // Normalize newlines to spaces so the shell argument never triggers readline's
  // `quote>` continuation prompt when the command is sent to the terminal.
  const normalizedPrompt = prompt.replace(/\n+/g, ' ').trim();

  if (provider === 'copilot') {
    const parts = ['gh', 'copilot'];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'yolo') parts.push('--yolo');
    parts.push('-p', sq(normalizedPrompt));
    return parts.join(' ');
  }

  // Claude provider (default)
  // Always use --print for non-plan modes so Claude runs non-interactively and exits on completion.
  // Plan mode is interactive and must not use --print (they are incompatible).
  const parts = [cliBinary];
  const isPlanMode = aiConfig?.permissionMode === 'plan';
  if (!isPlanMode) {
    parts.push('--print');
  }
  if (maxTokens !== undefined) {
    parts.push('--max-tokens', String(maxTokens));
  }
  if (aiConfig?.model) parts.push('--model', aiConfig.model);
  if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
    parts.push('--dangerously-skip-permissions');
  }
  // plan mode: no extra flag — Claude's default interactive mode asks for tool approval
  parts.push(sq(normalizedPrompt));
  return parts.join(' ');
}

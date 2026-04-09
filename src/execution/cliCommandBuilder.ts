import type { AIConfig, RequirementsAIConfig, ClaudeEffort } from '../config/aiConfigTypes';

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
  // Only dangerously-skip-permissions uses --print (one-shot, non-interactive).
  // Default and plan modes are interactive REPL — adding --print would put Claude into
  // one-shot mode without a way to approve tool use, causing it to hang or fail silently.
  const parts = [cliBinary];
  const isAutoMode = aiConfig?.permissionMode === 'dangerously-skip-permissions';
  if (isAutoMode) {
    parts.push('--print');
  }
  if (maxTokens !== undefined) {
    parts.push('--max-tokens', String(maxTokens));
  }
  if (aiConfig?.model) parts.push('--model', aiConfig.model);
  const effort = (aiConfig as AIConfig | undefined)?.effort ?? (aiConfig as RequirementsAIConfig | undefined)?.effort;
  if (effort) parts.push('--effort', effort as ClaudeEffort);
  if (isAutoMode) {
    parts.push('--dangerously-skip-permissions');
  }
  // plan mode: no extra flag — Claude's default interactive mode asks for tool approval
  parts.push(sq(normalizedPrompt));
  return parts.join(' ');
}

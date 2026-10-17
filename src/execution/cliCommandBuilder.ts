import type { AIConfig, RequirementsAIConfig, ClaudeEffort } from '../config/aiConfigTypes';
import type { ProviderDefinition } from '../config/providerTypes';
import { buildProviderCommand, resolveProviderBinary, resolveProviderDefinition } from './providerCommand';

export interface CliCommandOptions {
  cliBinary: string;
  aiConfig?: AIConfig | RequirementsAIConfig;
  /** The prompt text to send (will be shell-escaped automatically). */
  prompt: string;
  /** When provided, adds `--max-tokens <n>` alongside `--print` (used by CliRunner for captured output). */
  maxTokens?: number;
  /** Provider definition to use; defaults to the built-in or `aiConfig.customProviders` match. */
  providerDef?: ProviderDefinition;
}

/**
 * Builds a CLI command string from the given options, using the provider definition
 * for the binary, model, permission mode and prompt arguments.
 * The prompt is shell-escaped automatically — callers should pass raw text.
 */
export function buildCliCommand(options: CliCommandOptions): string {
  const { cliBinary, aiConfig, prompt, maxTokens } = options;
  const def = options.providerDef ?? resolveProviderDefinition(aiConfig);

  // Normalize newlines to spaces so the shell argument never triggers readline's
  // `quote>` continuation prompt when the command is sent to the terminal.
  const normalizedPrompt = prompt.replace(/\n+/g, ' ').trim();

  // Claude-only flags; other providers have no equivalent.
  const extraArgs: string[] = [];
  if (def.id === 'claude') {
    if (maxTokens !== undefined) extraArgs.push('--max-tokens', String(maxTokens));
    const effort = (aiConfig as AIConfig | undefined)?.effort ?? (aiConfig as RequirementsAIConfig | undefined)?.effort;
    if (effort) extraArgs.push('--effort', effort as ClaudeEffort);
  }

  return buildProviderCommand(def, {
    permissionModeId: aiConfig?.permissionMode ?? 'default',
    prompt: normalizedPrompt,
    model: aiConfig?.model,
    binaryOverride: resolveProviderBinary(def, cliBinary),
    extraArgs,
  }).command;
}

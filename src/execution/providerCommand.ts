import { BUILTIN_PROVIDERS, getProviderDefinition } from '../config/providerTypes';
import type { ProviderDefinition, ProviderPermissionMode } from '../config/providerTypes';
import { quoteForShell } from '../utils/shellQuote';

const SAFE_TOKEN = /^[A-Za-z0-9._:/-]+$/;

export interface ProviderCommandOptions {
  permissionModeId: string;
  prompt: string;
  model?: string;
  /** Replaces `def.binary` (carries `sdd.claudeCliBinary` for the `claude` provider). */
  binaryOverride?: string;
  platform?: NodeJS.Platform;
  /** Extra arguments inserted before the invocation args (already shell-safe). */
  extraArgs?: string[];
}

/** Resolves the provider for an AI config, falling back to the built-in `claude` definition. */
export function resolveProviderDefinition(
  config: { provider?: string; customProviders?: ProviderDefinition[] } | null | undefined,
): ProviderDefinition {
  return getProviderDefinition(config?.provider ?? 'claude', config?.customProviders) ?? BUILTIN_PROVIDERS[0];
}

/** The binary to run/check: the override for `claude`, otherwise the definition's own. */
export function resolveProviderBinary(def: ProviderDefinition, claudeBinary?: string): string {
  return def.id === 'claude' && claudeBinary ? claudeBinary : def.binary;
}

/** An unknown or missing permission mode id falls back to the provider's first mode. */
export function resolvePermissionMode(def: ProviderDefinition, permissionModeId: string | undefined): ProviderPermissionMode {
  return def.permissionModes.find((m) => m.id === permissionModeId) ?? def.permissionModes[0];
}

/** True when the permission mode runs one-shot (batch) rather than in an interactive REPL. */
export function isBatchMode(def: ProviderDefinition, permissionModeId: string | undefined): boolean {
  return resolvePermissionMode(def, permissionModeId).mode === 'batch';
}

/** Formats a file reference for a prompt, e.g. `@src/a.ts` or `#file:src/a.ts`. */
export function formatFileRef(def: ProviderDefinition, path: string): string {
  return def.fileRefFormat.replace('{path}', () => path);
}

export function buildProviderCommand(
  def: ProviderDefinition,
  opts: ProviderCommandOptions,
): { command: string; interactive: boolean } {
  const permission = resolvePermissionMode(def, opts.permissionModeId);
  const invocation = permission.mode === 'batch' ? def.batch : def.interactive;
  const quote = (value: string) => quoteForShell(value, opts.platform);

  const parts: string[] = [opts.binaryOverride || def.binary];

  if (opts.model && def.modelArgs) {
    // Plain model ids stay unquoted so built-in commands are unchanged; anything else is quoted.
    const model = SAFE_TOKEN.test(opts.model) ? opts.model : quote(opts.model);
    parts.push(...def.modelArgs.map((a) => a.replace('{model}', () => model)));
  }
  parts.push(...(permission.extraArgs ?? []));
  parts.push(...(opts.extraArgs ?? []));
  parts.push(...(invocation?.args ?? ['{prompt}']).map((a) => a.replace('{prompt}', () => quote(opts.prompt))));

  return { command: parts.join(' '), interactive: permission.mode !== 'batch' };
}

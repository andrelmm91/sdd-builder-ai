import { BUILTIN_MODELS, MODEL_ID_PATTERN } from './aiConfigTypes';

export interface ProviderInvocation {
  /** Placeholders allowed: `{prompt}` (required exactly once) and `{model}`. */
  args: string[];
}

export interface ProviderPermissionMode {
  id: string;
  label: string;
  mode: 'batch' | 'interactive';
  extraArgs?: string[];
}

export interface ProviderDefinition {
  id: string;
  label: string;
  binary: string;
  /** How a file is referenced in a prompt, e.g. `@{path}` or `#file:{path}`. */
  fileRefFormat: string;
  /** Non-interactive invocation. Omitted means the provider has no unattended mode. */
  batch?: ProviderInvocation;
  /** Interactive REPL invocation. */
  interactive?: ProviderInvocation;
  /** Included only when a model is set, e.g. `['--model', '{model}']`. */
  modelArgs?: string[];
  /** Suggested models for the UI. */
  models?: string[];
  permissionModes: ProviderPermissionMode[];
}

export interface ProviderValidationError {
  /** Offending field, e.g. `binary`, `batch.args[2]`, `permissionModes[1].extraArgs[0]`. */
  path: string;
  message: string;
}

export const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
/** No spaces, quotes or shell metacharacters; a path is allowed. */
export const BINARY_PATTERN = /^[A-Za-z0-9._/\\:-]{1,200}$/;

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'claude',
    label: 'Claude CLI',
    binary: 'claude',
    fileRefFormat: '@{path}',
    batch: { args: ['-p', '--dangerously-skip-permissions', '{prompt}'] },
    interactive: { args: ['{prompt}'] },
    modelArgs: ['--model', '{model}'],
    models: [...BUILTIN_MODELS.claude],
    permissionModes: [
      { id: 'default', label: 'Default (ask)', mode: 'interactive' },
      { id: 'plan', label: 'Plan', mode: 'interactive' },
      { id: 'dangerously-skip-permissions', label: 'Skip permissions', mode: 'batch' },
    ],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    binary: 'gh',
    fileRefFormat: '#file:{path}',
    batch: { args: ['copilot', '--yolo', '-p', '{prompt}'] },
    interactive: { args: ['copilot', '{prompt}'] },
    models: [...BUILTIN_MODELS.copilot],
    permissionModes: [
      { id: 'default', label: 'Default (ask)', mode: 'interactive' },
      { id: 'yolo', label: 'YOLO', mode: 'batch' },
    ],
  },
];

export function getProviderDefinition(
  id: string,
  custom?: ProviderDefinition[],
): ProviderDefinition | undefined {
  return custom?.find((p) => p.id === id) ?? BUILTIN_PROVIDERS.find((p) => p.id === id);
}

/** A non-empty user list (`ai.models`) replaces the definition's own list. */
export function resolveProviderModels(
  def: ProviderDefinition,
  userModels?: Record<string, string[]>,
): string[] {
  const user = userModels?.[def.id];
  if (Array.isArray(user) && user.length > 0) return [...user];
  return [...(def.models ?? [])];
}

const PLACEHOLDER_RE = /\{[^{}]*\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['{prompt}', '{model}']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function countOf(text: string, token: string): number {
  return text.split(token).length - 1;
}

/** Validates one argument list; `allowPrompt` is false for modelArgs/extraArgs. */
function validateArgs(
  args: unknown,
  path: string,
  allowPrompt: boolean,
  errors: ProviderValidationError[],
): string[] | undefined {
  if (!Array.isArray(args)) {
    errors.push({ path, message: 'must be an array of strings' });
    return undefined;
  }
  args.forEach((arg, i) => {
    const p = `${path}[${i}]`;
    if (typeof arg !== 'string') {
      errors.push({ path: p, message: 'must be a string' });
      return;
    }
    if (arg === '') errors.push({ path: p, message: 'must not be empty' });
    if (/[\r\n]/.test(arg)) errors.push({ path: p, message: 'must not contain a newline' });
    for (const ph of arg.match(PLACEHOLDER_RE) ?? []) {
      if (!ALLOWED_PLACEHOLDERS.has(ph)) {
        errors.push({ path: p, message: `unknown placeholder ${ph}; only {prompt} and {model} are allowed` });
      } else if (ph === '{prompt}' && !allowPrompt) {
        errors.push({ path: p, message: '{prompt} is not allowed here' });
      }
    }
  });
  return args.filter((a): a is string => typeof a === 'string');
}

function validateInvocation(
  inv: unknown,
  key: 'batch' | 'interactive',
  errors: ProviderValidationError[],
): void {
  if (!isRecord(inv)) {
    errors.push({ path: key, message: 'must be an object with an args array' });
    return;
  }
  const args = validateArgs(inv.args, `${key}.args`, true, errors);
  if (args && Array.isArray(inv.args)) {
    const prompts = args.reduce((n, a) => n + countOf(a, '{prompt}'), 0);
    if (prompts !== 1) {
      errors.push({ path: `${key}.args`, message: `must contain {prompt} exactly once (found ${prompts})` });
    }
  }
}

export function validateProviderDefinition(def: unknown): ProviderValidationError[] {
  const errors: ProviderValidationError[] = [];
  if (!isRecord(def)) {
    return [{ path: '', message: 'provider definition must be an object' }];
  }

  if (typeof def.id !== 'string' || !PROVIDER_ID_PATTERN.test(def.id)) {
    errors.push({ path: 'id', message: 'must start with a lowercase letter and contain only a-z, 0-9 and "-" (max 40 characters)' });
  }
  if (typeof def.label !== 'string' || def.label.trim() === '' || def.label.length > 60) {
    errors.push({ path: 'label', message: 'must be a non-empty string of at most 60 characters' });
  }
  if (typeof def.binary !== 'string' || !BINARY_PATTERN.test(def.binary)) {
    errors.push({ path: 'binary', message: 'must be a binary name or path without spaces, quotes or shell metacharacters' });
  }
  if (typeof def.fileRefFormat !== 'string' || countOf(def.fileRefFormat, '{path}') !== 1) {
    errors.push({ path: 'fileRefFormat', message: 'must contain {path} exactly once' });
  }

  if (def.batch === undefined && def.interactive === undefined) {
    errors.push({ path: 'batch', message: 'at least one of batch or interactive is required' });
  }
  if (def.batch !== undefined) validateInvocation(def.batch, 'batch', errors);
  if (def.interactive !== undefined) validateInvocation(def.interactive, 'interactive', errors);

  if (def.modelArgs !== undefined) {
    const modelArgs = validateArgs(def.modelArgs, 'modelArgs', false, errors);
    if (modelArgs && !modelArgs.some((a) => a.includes('{model}'))) {
      errors.push({ path: 'modelArgs', message: 'must contain {model}' });
    }
  }

  if (!Array.isArray(def.permissionModes) || def.permissionModes.length === 0) {
    errors.push({ path: 'permissionModes', message: 'must be a non-empty array' });
  } else {
    const seen = new Set<string>();
    def.permissionModes.forEach((pm: unknown, i: number) => {
      const p = `permissionModes[${i}]`;
      if (!isRecord(pm)) {
        errors.push({ path: p, message: 'must be an object' });
        return;
      }
      if (typeof pm.id !== 'string' || !PROVIDER_ID_PATTERN.test(pm.id)) {
        errors.push({ path: `${p}.id`, message: 'must start with a lowercase letter and contain only a-z, 0-9 and "-"' });
      } else if (seen.has(pm.id)) {
        errors.push({ path: `${p}.id`, message: `duplicate permission mode id "${pm.id}"` });
      } else {
        seen.add(pm.id);
      }
      if (typeof pm.label !== 'string' || pm.label.trim() === '') {
        errors.push({ path: `${p}.label`, message: 'must be a non-empty string' });
      }
      if (pm.mode !== 'batch' && pm.mode !== 'interactive') {
        errors.push({ path: `${p}.mode`, message: 'must be "batch" or "interactive"' });
      } else if (def[pm.mode] === undefined) {
        errors.push({ path: `${p}.mode`, message: `requires a "${pm.mode}" invocation, but none is defined` });
      }
      if (pm.extraArgs !== undefined) validateArgs(pm.extraArgs, `${p}.extraArgs`, false, errors);
    });
  }

  if (def.models !== undefined) {
    if (!Array.isArray(def.models)) {
      errors.push({ path: 'models', message: 'must be an array of strings' });
    } else {
      const seen = new Set<string>();
      def.models.forEach((m: unknown, i: number) => {
        const p = `models[${i}]`;
        if (typeof m !== 'string' || !MODEL_ID_PATTERN.test(m)) {
          errors.push({ path: p, message: 'is not a valid model id' });
        } else if (seen.has(m)) {
          errors.push({ path: p, message: `duplicate model "${m}"` });
        } else {
          seen.add(m);
        }
      });
    }
  }

  return errors;
}

export function validateProviderList(defs: unknown[]): ProviderValidationError[] {
  const errors: ProviderValidationError[] = [];
  const seen = new Set<string>();
  defs.forEach((def, i) => {
    for (const e of validateProviderDefinition(def)) {
      errors.push({ path: e.path ? `[${i}].${e.path}` : `[${i}]`, message: e.message });
    }
    const id = isRecord(def) ? def.id : undefined;
    if (typeof id === 'string') {
      if (seen.has(id)) errors.push({ path: `[${i}].id`, message: `duplicate provider id "${id}"` });
      seen.add(id);
    }
  });
  return errors;
}

import * as vscode from 'vscode';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { CONFIG_FILE, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { DEFAULT_AI_CONFIG, DEFAULT_REQUIREMENTS_AI_CONFIG, MODEL_ID_PATTERN, LEGACY_PRE_PROMPT } from './aiConfigTypes';
import type { AIConfig, RequirementsAIConfig } from './aiConfigTypes';
import {
  BUILTIN_PROVIDERS,
  resolveProviderModels,
  validateProviderDefinition,
  validateProviderList,
} from './providerTypes';
import type { ProviderDefinition } from './providerTypes';
import { listAvailableSkills } from '../execution/skillsLoader';

function sanitizeModels(raw: unknown): Record<string, string[]> | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn('[SDD] Ignoring ai.models: expected an object keyed by provider');
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [provider, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list) || !list.every((m) => typeof m === 'string' && m.trim() !== '')) {
      console.warn(`[SDD] Ignoring ai.models.${provider}: expected an array of non-empty strings`);
      continue;
    }
    result[provider] = [...new Set((list as string[]).map((m) => m.trim()))];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeCustomProviders(raw: unknown): ProviderDefinition[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    console.warn('[SDD] Ignoring ai.customProviders: expected an array');
    return undefined;
  }
  const result: ProviderDefinition[] = [];
  raw.forEach((entry, i) => {
    const errors = validateProviderDefinition(entry);
    if (errors.length > 0) {
      const detail = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      console.warn(`[SDD] Ignoring ai.customProviders[${i}]: ${detail}`);
      return;
    }
    const def = entry as ProviderDefinition;
    if (result.some((p) => p.id === def.id)) {
      console.warn(`[SDD] Ignoring ai.customProviders[${i}]: duplicate provider id "${def.id}"`);
      return;
    }
    result.push(def);
  });
  return result.length > 0 ? result : undefined;
}

/** Built-ins merged with valid custom providers (custom overrides by `id`), with models resolved. */
export function getAvailableProviders(aiConfig?: AIConfig): ProviderDefinition[] {
  const merged = [...BUILTIN_PROVIDERS];
  for (const custom of aiConfig?.customProviders ?? []) {
    const index = merged.findIndex((p) => p.id === custom.id);
    if (index >= 0) {
      merged[index] = custom;
    } else {
      merged.push(custom);
    }
  }
  return merged.map((def) => ({ ...def, models: resolveProviderModels(def, aiConfig?.models) }));
}

export function getModelsForProvider(provider: string, aiConfig?: AIConfig): string[] {
  return getAvailableProviders(aiConfig).find((p) => p.id === provider)?.models ?? [];
}

export async function readAIConfig(): Promise<AIConfig | undefined> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  if (!content) {
    // config.json doesn't exist — project not initialized
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as { ai?: Partial<AIConfig> };
    // File exists but no ai key yet — return defaults so the form is usable
    const ai = parsed.ai ?? {};
    const models = sanitizeModels(ai.models);
    const customProviders = sanitizeCustomProviders(ai.customProviders);
    let provider = ai.provider ?? DEFAULT_AI_CONFIG.provider;
    const known = [...BUILTIN_PROVIDERS, ...(customProviders ?? [])];
    if (!known.some((p) => p.id === provider)) {
      console.warn(`[SDD] Unknown ai.provider "${provider}"; falling back to "${DEFAULT_AI_CONFIG.provider}"`);
      provider = DEFAULT_AI_CONFIG.provider;
    }
    return {
      provider,
      permissionMode: ai.permissionMode ?? DEFAULT_AI_CONFIG.permissionMode,
      model: ai.model ?? DEFAULT_AI_CONFIG.model,
      effort: (ai as Partial<AIConfig>).effort ?? DEFAULT_AI_CONFIG.effort,
      tagSkillMappings: ai.tagSkillMappings ?? [],
      prePromptTemplate:
        ai.prePromptTemplate === undefined || ai.prePromptTemplate === LEGACY_PRE_PROMPT
          ? DEFAULT_AI_CONFIG.prePromptTemplate
          : ai.prePromptTemplate,
      commitCommand: ai.commitCommand ?? DEFAULT_AI_CONFIG.commitCommand,
      commitCommandEnabled: ai.commitCommandEnabled ?? DEFAULT_AI_CONFIG.commitCommandEnabled,
      prCommand: ai.prCommand ?? DEFAULT_AI_CONFIG.prCommand,
      prCommandEnabled: ai.prCommandEnabled ?? DEFAULT_AI_CONFIG.prCommandEnabled,
      ...(models ? { models } : {}),
      ...(customProviders ? { customProviders } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function writeAIConfig(config: AIConfig): Promise<void> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  let existing: Record<string, unknown> = {};
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // keep existing as empty
    }
  }
  // ai.models is owned by writeAIModels() and ai.customProviders by writeCustomProviders();
  // always keep whatever is on disk.
  const previous = (existing['ai'] as { models?: unknown; customProviders?: unknown } | undefined) ?? {};
  const next: Record<string, unknown> = { ...config };
  delete next['models'];
  delete next['customProviders'];
  if (previous.models !== undefined) {
    next['models'] = previous.models;
  }
  if (previous.customProviders !== undefined) {
    next['customProviders'] = previous.customProviders;
  }
  existing['ai'] = next;
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

/** Replace only `ai.models`. Empty providers fall back to the built-in list. */
export async function writeAIModels(models: Record<string, string[]>): Promise<void> {
  const cleaned: Record<string, string[]> = {};
  for (const [provider, list] of Object.entries(models)) {
    const entries: string[] = [];
    for (const raw of list) {
      const value = String(raw).trim();
      if (value === '') {
        continue;
      }
      if (!MODEL_ID_PATTERN.test(value)) {
        throw new Error(`Invalid model id for ${provider}: "${value}"`);
      }
      if (!entries.includes(value)) {
        entries.push(value);
      }
    }
    if (entries.length > 0) {
      cleaned[provider] = entries;
    }
  }

  const content = await readWorkspaceFile(CONFIG_FILE);
  let existing: Record<string, unknown> = {};
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // keep existing as empty
    }
  }
  const ai: Record<string, unknown> = { ...((existing['ai'] as Record<string, unknown> | undefined) ?? {}) };
  if (Object.keys(cleaned).length > 0) {
    ai['models'] = cleaned;
  } else {
    delete ai['models'];
  }
  existing['ai'] = ai;
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

function cleanProvider(def: ProviderDefinition): ProviderDefinition {
  const nonEmpty = (list?: string[]) => (list && list.length > 0 ? [...list] : undefined);
  const cleaned: ProviderDefinition = {
    id: def.id.trim(),
    label: def.label.trim(),
    binary: def.binary.trim(),
    fileRefFormat: def.fileRefFormat.trim(),
    permissionModes: def.permissionModes.map((pm) => {
      const extraArgs = nonEmpty(pm.extraArgs);
      return {
        id: pm.id.trim(),
        label: pm.label.trim(),
        mode: pm.mode,
        ...(extraArgs ? { extraArgs } : {}),
      };
    }),
  };
  const modelArgs = nonEmpty(def.modelArgs);
  const models = nonEmpty(def.models?.map((m) => m.trim()));
  if (def.batch) cleaned.batch = { args: [...def.batch.args] };
  if (def.interactive) cleaned.interactive = { args: [...def.interactive.args] };
  if (modelArgs) cleaned.modelArgs = modelArgs;
  if (models) cleaned.models = models;
  return cleaned;
}

/** Replace only `ai.customProviders`. Removing a provider also prunes its `ai.models` entry. */
export async function writeCustomProviders(defs: ProviderDefinition[]): Promise<void> {
  const errors = validateProviderList(defs);
  if (errors.length > 0) {
    throw new Error(`Invalid provider definitions:\n${errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
  }
  const cleaned = defs.map(cleanProvider);

  const content = await readWorkspaceFile(CONFIG_FILE);
  let existing: Record<string, unknown> = {};
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // keep existing as empty
    }
  }
  const ai: Record<string, unknown> = { ...((existing['ai'] as Record<string, unknown> | undefined) ?? {}) };

  const remaining = new Set([...BUILTIN_PROVIDERS.map((p) => p.id), ...cleaned.map((p) => p.id)]);
  const references: Array<[string, unknown]> = [
    ['ai.provider', ai['provider']],
    ['requirementsAi.provider', (existing['requirementsAi'] as { provider?: unknown } | undefined)?.provider],
  ];
  for (const [setting, id] of references) {
    if (typeof id === 'string' && !remaining.has(id)) {
      throw new Error(`Cannot remove provider "${id}": it is used by ${setting}`);
    }
  }

  const previousIds = Array.isArray(ai['customProviders'])
    ? (ai['customProviders'] as Array<{ id?: unknown }>)
        .map((p) => p?.id)
        .filter((id): id is string => typeof id === 'string')
    : [];
  const removedIds = previousIds.filter((id) => !remaining.has(id));
  const models = ai['models'];
  if (removedIds.length > 0 && typeof models === 'object' && models !== null && !Array.isArray(models)) {
    const pruned = { ...(models as Record<string, unknown>) };
    for (const id of removedIds) {
      delete pruned[id];
    }
    if (Object.keys(pruned).length > 0) {
      ai['models'] = pruned;
    } else {
      delete ai['models'];
    }
  }

  if (cleaned.length > 0) {
    ai['customProviders'] = cleaned;
  } else {
    delete ai['customProviders'];
  }
  existing['ai'] = ai;
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

export async function readRequirementsAIConfig(): Promise<RequirementsAIConfig | undefined> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  if (!content) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as { requirementsAi?: Partial<RequirementsAIConfig> };
    const req = parsed.requirementsAi ?? {};
    return {
      provider: req.provider ?? DEFAULT_REQUIREMENTS_AI_CONFIG.provider,
      model: req.model ?? DEFAULT_REQUIREMENTS_AI_CONFIG.model,
      permissionMode: req.permissionMode ?? DEFAULT_REQUIREMENTS_AI_CONFIG.permissionMode,
      effort: req.effort ?? DEFAULT_REQUIREMENTS_AI_CONFIG.effort,
      idealizePromptTemplate: req.idealizePromptTemplate ?? DEFAULT_REQUIREMENTS_AI_CONFIG.idealizePromptTemplate,
      createSddCardsPromptTemplate: req.createSddCardsPromptTemplate ?? DEFAULT_REQUIREMENTS_AI_CONFIG.createSddCardsPromptTemplate,
    };
  } catch {
    return undefined;
  }
}

export async function writeRequirementsAIConfig(config: RequirementsAIConfig): Promise<void> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  let existing: Record<string, unknown> = {};
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // keep existing as empty
    }
  }
  existing['requirementsAi'] = config;
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

export async function getAvailableTags(): Promise<string[]> {
  const root = getWorkspaceRoot();
  if (!root) {
    return [];
  }

  try {
    const pattern = `${SPECS_FOLDER}/*${SPEC_FILE_EXTENSION}`;
    const uris = await vscode.workspace.findFiles(pattern);
    const tags = new Set<string>();

    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString('utf8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const frontmatter = match[1];
          // Inline format: tags: [tag1, tag2]
          const inlineMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m);
          if (inlineMatch) {
            const tagList = inlineMatch[1].split(',').map((t) => t.trim().replace(/['"]/g, ''));
            for (const tag of tagList) {
              if (tag) tags.add(tag);
            }
          } else {
            // Block sequence format:
            // tags:
            //   - tag1
            //   - tag2
            const blockMatch = frontmatter.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
            if (blockMatch) {
              const items = blockMatch[1].matchAll(/[ \t]+-\s*(.+)/g);
              for (const item of items) {
                const tag = item[1].trim().replace(/['"]/g, '');
                if (tag) tags.add(tag);
              }
            }
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    return [...tags].sort();
  } catch {
    return [];
  }
}

export async function getAvailableSkills(): Promise<string[]> {
  try {
    return await listAvailableSkills();
  } catch {
    return [];
  }
}

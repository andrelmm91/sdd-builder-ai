import * as vscode from 'vscode';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { CONFIG_FILE, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { DEFAULT_AI_CONFIG, DEFAULT_REQUIREMENTS_AI_CONFIG, BUILTIN_MODELS, MODEL_ID_PATTERN, LEGACY_PRE_PROMPT } from './aiConfigTypes';
import type { AIConfig, RequirementsAIConfig } from './aiConfigTypes';
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

export function getModelsForProvider(provider: string, aiConfig?: AIConfig): string[] {
  const custom = aiConfig?.models?.[provider];
  if (custom && custom.length > 0) {
    return [...custom];
  }
  return [...(BUILTIN_MODELS[provider] ?? [])];
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
    return {
      provider: ai.provider ?? DEFAULT_AI_CONFIG.provider,
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
  // ai.models is owned by writeAIModels(); always keep whatever is on disk.
  const previousModels = (existing['ai'] as { models?: unknown } | undefined)?.models;
  const next: Record<string, unknown> = { ...config };
  delete next['models'];
  if (previousModels !== undefined) {
    next['models'] = previousModels;
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

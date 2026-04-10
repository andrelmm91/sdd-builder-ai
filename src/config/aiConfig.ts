import * as vscode from 'vscode';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { CONFIG_FILE, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { DEFAULT_AI_CONFIG, DEFAULT_REQUIREMENTS_AI_CONFIG } from './aiConfigTypes';
import type { AIConfig, RequirementsAIConfig } from './aiConfigTypes';
import { listAvailableSkills } from '../execution/skillsLoader';

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
    return {
      provider: ai.provider ?? DEFAULT_AI_CONFIG.provider,
      permissionMode: ai.permissionMode ?? DEFAULT_AI_CONFIG.permissionMode,
      model: ai.model ?? DEFAULT_AI_CONFIG.model,
      effort: (ai as Partial<AIConfig>).effort ?? DEFAULT_AI_CONFIG.effort,
      tagSkillMappings: ai.tagSkillMappings ?? [],
      prePromptTemplate: ai.prePromptTemplate ?? DEFAULT_AI_CONFIG.prePromptTemplate,
      commitCommand: ai.commitCommand ?? DEFAULT_AI_CONFIG.commitCommand,
      commitCommandEnabled: ai.commitCommandEnabled ?? DEFAULT_AI_CONFIG.commitCommandEnabled,
      prCommand: ai.prCommand ?? DEFAULT_AI_CONFIG.prCommand,
      prCommandEnabled: ai.prCommandEnabled ?? DEFAULT_AI_CONFIG.prCommandEnabled,
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
  existing['ai'] = config;
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

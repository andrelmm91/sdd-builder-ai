import * as vscode from 'vscode';
import * as path from 'path';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { AI_CONFIG_FILE, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { DEFAULT_AI_CONFIG } from './aiConfigTypes';
import type { AIConfig } from './aiConfigTypes';

export async function readAIConfig(): Promise<AIConfig> {
  const content = await readWorkspaceFile(AI_CONFIG_FILE);
  if (!content) {
    return { ...DEFAULT_AI_CONFIG, tagSkillMappings: [] };
  }
  try {
    const parsed = JSON.parse(content) as Partial<AIConfig>;
    return {
      ...DEFAULT_AI_CONFIG,
      ...parsed,
      tagSkillMappings: parsed.tagSkillMappings ?? [],
    };
  } catch {
    console.warn('Invalid AI config JSON, using defaults');
    return { ...DEFAULT_AI_CONFIG, tagSkillMappings: [] };
  }
}

export async function writeAIConfig(config: AIConfig): Promise<void> {
  await writeWorkspaceFile(AI_CONFIG_FILE, JSON.stringify(config, null, 2));
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
          const tagMatch = match[1].match(/^tags:\s*\[([^\]]*)\]/m);
          if (tagMatch) {
            const tagList = tagMatch[1].split(',').map((t) => t.trim().replace(/['"]/g, ''));
            for (const tag of tagList) {
              if (tag) {
                tags.add(tag);
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
  const root = getWorkspaceRoot();
  if (!root) {
    return [];
  }

  try {
    const skillsDir = vscode.Uri.file(path.join(root, '.claude', 'skills'));
    const entries = await vscode.workspace.fs.readDirectory(skillsDir);
    return entries
      .map(([name]) => name.replace(/\.[^.]+$/, ''))
      .sort();
  } catch {
    return [];
  }
}

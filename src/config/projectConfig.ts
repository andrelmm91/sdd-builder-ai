import { readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { CONFIG_FILE, DEFAULT_PREFIX } from '../utils/constants';
import type { AIConfig } from './aiConfigTypes';

export interface ProjectConfig {
  prefix: string;
  testCommand: string;
  conventionsPath: string;
  skillsPath: string;
  ai?: Partial<AIConfig>;
}

export function getDefaultProjectConfig(): ProjectConfig {
  return {
    prefix: DEFAULT_PREFIX,
    testCommand: 'npm test',
    conventionsPath: '.sdd/conventions.md',
    skillsPath: '.sdd/skills',
  };
}

export async function readProjectConfig(): Promise<ProjectConfig> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  if (!content) {
    return getDefaultProjectConfig();
  }
  try {
    const parsed = JSON.parse(content) as Partial<ProjectConfig>;
    return { ...getDefaultProjectConfig(), ...parsed };
  } catch {
    return getDefaultProjectConfig();
  }
}

/**
 * Writes project-level fields to config.json, preserving any other keys (e.g. `ai`).
 */
export async function writeProjectConfig(config: ProjectConfig): Promise<void> {
  const content = await readWorkspaceFile(CONFIG_FILE);
  let existing: Record<string, unknown> = {};
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // start fresh
    }
  }
  const merged = { ...existing, ...config };
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

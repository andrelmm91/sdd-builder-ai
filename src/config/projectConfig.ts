import { readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { CONFIG_FILE, DEFAULT_PREFIX } from '../utils/constants';

export interface ProjectConfig {
  prefix: string;
  testCommand: string;
  conventionsPath: string;
  skillsPath: string;
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

export async function writeProjectConfig(config: ProjectConfig): Promise<void> {
  await writeWorkspaceFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

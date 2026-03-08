import { fileExists, listFiles, readWorkspaceFile } from '../utils/fileSystem';

const SEARCH_DIRS = ['.sdd/skills', '.claude/skills'];

function candidatePaths(skillsName: string): string[] {
  return SEARCH_DIRS.flatMap((dir) => [
    `${dir}/${skillsName}/SKILL.md`,
    `${dir}/${skillsName}.md`,
  ]);
}

/**
 * Returns the resolved file path for the given skills name, or undefined if not found.
 */
export async function getSkillsPath(skillsName: string): Promise<string | undefined> {
  for (const candidate of candidatePaths(skillsName)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Reads and returns the content of the skills file for the given skills name.
 * Returns undefined if no skills file is found.
 * The returned content includes a header with the skill path for traceability.
 */
export async function loadSkills(skillsName: string): Promise<string | undefined> {
  const resolvedPath = await getSkillsPath(skillsName);
  if (!resolvedPath) {
    return undefined;
  }
  const content = await readWorkspaceFile(resolvedPath);
  if (!content) {
    return undefined;
  }
  return `> Skill: "${skillsName}" (from ${resolvedPath})\n\n${content}`;
}

/**
 * Returns the names of all available skills across both .sdd/skills/ and .claude/skills/ directories.
 */
export async function listAvailableSkills(): Promise<string[]> {
  const patterns = [
    '.sdd/skills/**/SKILL.md',
    '.sdd/skills/*.md',
    '.claude/skills/**/SKILL.md',
    '.claude/skills/*.md',
  ];

  const allFiles: string[] = [];
  for (const pattern of patterns) {
    const files = await listFiles(pattern);
    allFiles.push(...files);
  }

  const names = new Set<string>();
  for (const filePath of allFiles) {
    // .sdd/skills/name/SKILL.md  →  name
    // .sdd/skills/name.md        →  name
    const match =
      filePath.match(/(?:\.sdd|\.claude)\/skills\/(.+?)\/SKILL\.md$/) ??
      filePath.match(/(?:\.sdd|\.claude)\/skills\/(.+?)\.md$/);
    if (match) {
      names.add(match[1]);
    }
  }

  return Array.from(names).sort();
}

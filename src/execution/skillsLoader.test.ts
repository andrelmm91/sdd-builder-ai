import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fileSystem', () => ({
  fileExists: vi.fn(),
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
}));

import { loadSkills, getSkillsPath, listAvailableSkills } from './skillsLoader';
import { fileExists, listFiles, readWorkspaceFile } from '../utils/fileSystem';

const mockFileExists = vi.mocked(fileExists);
const mockListFiles = vi.mocked(listFiles);
const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockFileExists.mockResolvedValue(false);
  mockListFiles.mockResolvedValue([]);
  mockReadWorkspaceFile.mockResolvedValue(undefined);
});

describe('getSkillsPath', () => {
  it('resolves to .sdd/skills/{name}/SKILL.md first', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.sdd/skills/backend-dev/SKILL.md');

    const result = await getSkillsPath('backend-dev');
    expect(result).toBe('.sdd/skills/backend-dev/SKILL.md');
  });

  it('falls back to .sdd/skills/{name}.md when directory form is missing', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.sdd/skills/backend-dev.md');

    const result = await getSkillsPath('backend-dev');
    expect(result).toBe('.sdd/skills/backend-dev.md');
  });

  it('falls back to .claude/skills/{name}/SKILL.md when .sdd paths are missing', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.claude/skills/backend-dev/SKILL.md');

    const result = await getSkillsPath('backend-dev');
    expect(result).toBe('.claude/skills/backend-dev/SKILL.md');
  });

  it('falls back to .claude/skills/{name}.md last', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.claude/skills/backend-dev.md');

    const result = await getSkillsPath('backend-dev');
    expect(result).toBe('.claude/skills/backend-dev.md');
  });

  it('returns undefined when no skills file is found', async () => {
    const result = await getSkillsPath('nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('loadSkills', () => {
  it('returns content when skills file is found in .sdd/skills/', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.sdd/skills/backend-dev.md');
    mockReadWorkspaceFile.mockResolvedValue('# Backend Dev\n\nWrite clean code.');

    const result = await loadSkills('backend-dev');
    expect(result).toBe('# Backend Dev\n\nWrite clean code.');
    expect(mockReadWorkspaceFile).toHaveBeenCalledWith('.sdd/skills/backend-dev.md');
  });

  it('returns content when fallback to .claude/skills/ works', async () => {
    mockFileExists.mockImplementation(async (p) => p === '.claude/skills/sdd-planner.md');
    mockReadWorkspaceFile.mockResolvedValue('# SDD Planner\n\nPlan specs carefully.');

    const result = await loadSkills('sdd-planner');
    expect(result).toBe('# SDD Planner\n\nPlan specs carefully.');
    expect(mockReadWorkspaceFile).toHaveBeenCalledWith('.claude/skills/sdd-planner.md');
  });

  it('returns undefined when no skills file is found', async () => {
    const result = await loadSkills('nonexistent-skill');
    expect(result).toBeUndefined();
    expect(mockReadWorkspaceFile).not.toHaveBeenCalled();
  });

  it('does not throw when skills file is missing', async () => {
    await expect(loadSkills('missing')).resolves.toBeUndefined();
  });
});

describe('listAvailableSkills', () => {
  it('returns an empty array when no skills files exist', async () => {
    const result = await listAvailableSkills();
    expect(result).toEqual([]);
  });

  it('returns skill names from .sdd/skills/*.md files', async () => {
    mockListFiles.mockImplementation(async (pattern) => {
      if (pattern === '.sdd/skills/*.md') {
        return ['.sdd/skills/backend-dev.md', '.sdd/skills/frontend-dev.md'];
      }
      return [];
    });

    const result = await listAvailableSkills();
    expect(result).toContain('backend-dev');
    expect(result).toContain('frontend-dev');
  });

  it('returns skill names from .sdd/skills/**/SKILL.md files', async () => {
    mockListFiles.mockImplementation(async (pattern) => {
      if (pattern === '.sdd/skills/**/SKILL.md') {
        return ['.sdd/skills/sdd-planner/SKILL.md'];
      }
      return [];
    });

    const result = await listAvailableSkills();
    expect(result).toContain('sdd-planner');
  });

  it('includes skills from .claude/skills/ directories', async () => {
    mockListFiles.mockImplementation(async (pattern) => {
      if (pattern === '.claude/skills/*.md') {
        return ['.claude/skills/reviewer.md'];
      }
      return [];
    });

    const result = await listAvailableSkills();
    expect(result).toContain('reviewer');
  });

  it('deduplicates skills appearing in multiple locations', async () => {
    mockListFiles.mockImplementation(async (pattern) => {
      if (pattern === '.sdd/skills/*.md') {
        return ['.sdd/skills/backend-dev.md'];
      }
      if (pattern === '.claude/skills/*.md') {
        return ['.claude/skills/backend-dev.md'];
      }
      return [];
    });

    const result = await listAvailableSkills();
    const count = result.filter((name) => name === 'backend-dev').length;
    expect(count).toBe(1);
  });

  it('returns skills sorted alphabetically', async () => {
    mockListFiles.mockImplementation(async (pattern) => {
      if (pattern === '.sdd/skills/*.md') {
        return ['.sdd/skills/zebra.md', '.sdd/skills/alpha.md', '.sdd/skills/middle.md'];
      }
      return [];
    });

    const result = await listAvailableSkills();
    expect(result).toEqual(['alpha', 'middle', 'zebra']);
  });
});

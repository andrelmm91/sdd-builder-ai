import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  getWorkspaceRoot: vi.fn(() => '/workspace'),
}));

import { readAIConfig, writeAIConfig, getAvailableTags, getAvailableSkills } from './aiConfig';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { DEFAULT_AI_CONFIG } from './aiConfigTypes';

const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockWriteWorkspaceFile = vi.mocked(writeWorkspaceFile);
const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockFindFiles = vi.mocked(vscode.workspace.findFiles);
const mockReadFile = vi.mocked(vscode.workspace.fs.readFile);
const mockReadDirectory = vi.mocked(vscode.workspace.fs.readDirectory);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspaceRoot.mockReturnValue('/workspace');
});

describe('readAIConfig', () => {
  it('returns defaults when file does not exist', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);
    const config = await readAIConfig();
    expect(config).toEqual({ ...DEFAULT_AI_CONFIG, tagSkillMappings: [] });
  });

  it('returns defaults when file contains invalid JSON', async () => {
    mockReadWorkspaceFile.mockResolvedValue('not json{');
    const config = await readAIConfig();
    expect(config).toEqual({ ...DEFAULT_AI_CONFIG, tagSkillMappings: [] });
  });

  it('merges partial config with defaults', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ provider: 'copilot', model: 'gpt-4o' }));
    const config = await readAIConfig();
    expect(config.provider).toBe('copilot');
    expect(config.model).toBe('gpt-4o');
    expect(config.permissionMode).toBe('default');
    expect(config.prePromptTemplate).toBe(DEFAULT_AI_CONFIG.prePromptTemplate);
  });

  it('reads complete config from file', async () => {
    const fullConfig = {
      provider: 'copilot' as const,
      permissionMode: 'yolo' as const,
      model: 'gpt-4o',
      tagSkillMappings: [{ tag: 'backend', skill: 'backend-dev' }],
      prePromptTemplate: 'custom prompt',
      commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
      commitCommandEnabled: true,
      prCommand: 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"',
      prCommandEnabled: false,
    };
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify(fullConfig));
    const config = await readAIConfig();
    expect(config).toEqual(fullConfig);
  });
});

describe('writeAIConfig', () => {
  it('writes formatted JSON to the config file', async () => {
    mockWriteWorkspaceFile.mockResolvedValue(undefined);
    const config = { ...DEFAULT_AI_CONFIG, tagSkillMappings: [] };
    await writeAIConfig(config);
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      '.sdd/ai-config.json',
      JSON.stringify(config, null, 2),
    );
  });
});

describe('getAvailableTags', () => {
  it('returns empty array when no workspace', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);
    const tags = await getAvailableTags();
    expect(tags).toEqual([]);
  });

  it('extracts unique sorted tags from spec files', async () => {
    const specContent = `---
spec_id: SDD-001
title: Test
tags: [backend, frontend, backend]
---
## Context`;
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/.specs/test.sdd.md' } as vscode.Uri,
    ]);
    mockReadFile.mockResolvedValue(Buffer.from(specContent) as unknown as Uint8Array);
    const tags = await getAvailableTags();
    expect(tags).toEqual(['backend', 'frontend']);
  });

  it('returns empty array on error', async () => {
    mockFindFiles.mockRejectedValue(new Error('fail'));
    const tags = await getAvailableTags();
    expect(tags).toEqual([]);
  });
});

describe('getAvailableSkills', () => {
  it('returns empty array when no workspace', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);
    const skills = await getAvailableSkills();
    expect(skills).toEqual([]);
  });

  it('returns skill names from .claude/skills directory', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory = vi.fn().mockResolvedValue([
      ['backend-dev.md', 1],
      ['frontend-dev.md', 1],
    ]);
    const skills = await getAvailableSkills();
    expect(skills).toEqual(['backend-dev', 'frontend-dev']);
  });

  it('returns empty array on error', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory = vi.fn().mockRejectedValue(new Error('no dir'));
    const skills = await getAvailableSkills();
    expect(skills).toEqual([]);
  });
});

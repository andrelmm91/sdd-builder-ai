import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  getWorkspaceRoot: vi.fn(() => '/workspace'),
  listFiles: vi.fn(),
}));

import { readAIConfig, writeAIConfig, getAvailableTags, getAvailableSkills } from './aiConfig';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot, listFiles } from '../utils/fileSystem';
import { DEFAULT_AI_CONFIG } from './aiConfigTypes';

const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockWriteWorkspaceFile = vi.mocked(writeWorkspaceFile);
const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockListFiles = vi.mocked(listFiles);
const mockFindFiles = vi.mocked(vscode.workspace.findFiles);
const mockReadFile = vi.mocked(vscode.workspace.fs.readFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspaceRoot.mockReturnValue('/workspace');
  mockReadWorkspaceFile.mockResolvedValue(undefined);
  mockListFiles.mockResolvedValue([]);
});

describe('readAIConfig', () => {
  it('returns undefined when file does not exist', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);
    const config = await readAIConfig();
    expect(config).toBeUndefined();
  });

  it('returns undefined when file contains invalid JSON', async () => {
    mockReadWorkspaceFile.mockResolvedValue('not json{');
    const config = await readAIConfig();
    expect(config).toBeUndefined();
  });

  it('merges partial config with defaults', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { provider: 'copilot', model: 'gpt-4o' } }));
    const config = await readAIConfig();
    expect(config!.provider).toBe('copilot');
    expect(config!.model).toBe('gpt-4o');
    expect(config!.permissionMode).toBe('default');
    expect(config!.prePromptTemplate).toBe(DEFAULT_AI_CONFIG.prePromptTemplate);
  });

  it('reads complete config from file', async () => {
    const fullConfig = {
      provider: 'copilot' as const,
      permissionMode: 'yolo' as const,
      model: 'gpt-4o',
      effort: 'medium' as const,
      tagSkillMappings: [{ tag: 'backend', skill: 'backend-dev' }],
      prePromptTemplate: 'custom prompt',
      commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
      commitCommandEnabled: true,
      prCommand: 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"',
      prCommandEnabled: false,
    };
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: fullConfig }));
    const config = await readAIConfig();
    expect(config).toEqual(fullConfig);
  });
});

describe('writeAIConfig', () => {
  it('writes formatted JSON to the config file', async () => {
    mockWriteWorkspaceFile.mockResolvedValue(undefined);
    mockReadWorkspaceFile.mockResolvedValue(undefined);
    const config = { ...DEFAULT_AI_CONFIG, tagSkillMappings: [] };
    await writeAIConfig(config);
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      '.sdd/config.json',
      JSON.stringify({ ai: config }, null, 2),
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

  it('extracts tags from block sequence format', async () => {
    const specContent = `---
spec_id: SDD-002
title: Test
tags:
  - backend
  - frontend
  - backend
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
  it('returns empty array when no skill files exist', async () => {
    mockListFiles.mockResolvedValue([]);
    const skills = await getAvailableSkills();
    expect(skills).toEqual([]);
  });

  it('returns skill names from .claude/skills directory', async () => {
    mockListFiles.mockResolvedValue([
      '.claude/skills/backend-dev.md',
      '.claude/skills/frontend-dev.md',
    ]);
    const skills = await getAvailableSkills();
    expect(skills).toEqual(['backend-dev', 'frontend-dev']);
  });

  it('returns empty array on error', async () => {
    mockListFiles.mockRejectedValue(new Error('no dir'));
    const skills = await getAvailableSkills();
    expect(skills).toEqual([]);
  });
});

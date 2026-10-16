import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  getWorkspaceRoot: vi.fn(() => '/workspace'),
  listFiles: vi.fn(),
}));

import { readAIConfig, writeAIConfig, writeAIModels, getModelsForProvider, getAvailableTags, getAvailableSkills } from './aiConfig';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot, listFiles } from '../utils/fileSystem';
import { DEFAULT_AI_CONFIG, BUILTIN_MODELS, DEFAULT_PRE_PROMPT, LEGACY_PRE_PROMPT } from './aiConfigTypes';

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

  it('migrates the legacy pre-prompt to the new default', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { prePromptTemplate: LEGACY_PRE_PROMPT } }));
    const config = await readAIConfig();
    expect(config!.prePromptTemplate).toBe(DEFAULT_PRE_PROMPT);
  });

  it('preserves a custom pre-prompt', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { prePromptTemplate: 'Do {spec_file} my way' } }));
    const config = await readAIConfig();
    expect(config!.prePromptTemplate).toBe('Do {spec_file} my way');
  });

  it('falls back to the new default when the pre-prompt is missing', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: {} }));
    const config = await readAIConfig();
    expect(config!.prePromptTemplate).toBe(DEFAULT_PRE_PROMPT);
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

describe('ai.models', () => {
  it('drops invalid entries, trims and de-duplicates valid ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({
      ai: { models: { claude: [' fable ', 'fable', 'opus'], copilot: ['', 'x'], bad: 'nope' } },
    }));
    const config = await readAIConfig();
    expect(config!.models).toEqual({ claude: ['fable', 'opus'] });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('writeAIConfig ignores a payload models that differs from disk', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { models: { claude: ['fable'] } } }));
    await writeAIConfig({ ...DEFAULT_AI_CONFIG, models: { claude: ['other'] } });
    const written = JSON.parse(mockWriteWorkspaceFile.mock.calls[0][1]);
    expect(written.ai.models).toEqual({ claude: ['fable'] });
  });

  it('writeAIConfig drops payload models when none is on disk', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: {} }));
    await writeAIConfig({ ...DEFAULT_AI_CONFIG, models: { claude: ['other'] } });
    const written = JSON.parse(mockWriteWorkspaceFile.mock.calls[0][1]);
    expect(written.ai.models).toBeUndefined();
  });

  it('writeAIConfig preserves ai.models already on disk when config omits it', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { models: { claude: ['fable'] } } }));
    await writeAIConfig({ ...DEFAULT_AI_CONFIG });
    const written = JSON.parse(mockWriteWorkspaceFile.mock.calls[0][1]);
    expect(written.ai.models).toEqual({ claude: ['fable'] });
  });
});

describe('writeAIModels', () => {
  const written = () => JSON.parse(mockWriteWorkspaceFile.mock.calls[0][1]);

  it('writes a list and keeps other ai and top-level keys', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ name: 'x', ai: { provider: 'copilot', model: 'm' } }));
    await writeAIModels({ claude: ['fable', 'opus'] });
    expect(written()).toEqual({
      name: 'x',
      ai: { provider: 'copilot', model: 'm', models: { claude: ['fable', 'opus'] } },
    });
  });

  it('trims, drops empties and de-duplicates keeping first order', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({}));
    await writeAIModels({ claude: [' b ', 'a', '', 'b', '  '] });
    expect(written().ai.models).toEqual({ claude: ['b', 'a'] });
  });

  it('removes empty providers', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { models: { claude: ['x'], copilot: ['y'] } } }));
    await writeAIModels({ claude: [], copilot: ['y'] });
    expect(written().ai.models).toEqual({ copilot: ['y'] });
  });

  it('deletes ai.models when all providers are empty', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ ai: { provider: 'claude', models: { claude: ['x'] } } }));
    await writeAIModels({ claude: [], copilot: [] });
    expect(written().ai).toEqual({ provider: 'claude' });
  });

  it('rejects an invalid id without writing', async () => {
    mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({}));
    await expect(writeAIModels({ claude: ['ok', 'my model'] })).rejects.toThrow(/claude.*my model/);
    expect(mockWriteWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe('getModelsForProvider', () => {
  it('returns built-in list without user models', () => {
    expect(getModelsForProvider('claude')).toEqual([...BUILTIN_MODELS.claude]);
  });

  it('user list replaces the built-in list', () => {
    const cfg = { ...DEFAULT_AI_CONFIG, models: { claude: ['fable'] } };
    expect(getModelsForProvider('claude', cfg)).toEqual(['fable']);
    expect(getModelsForProvider('copilot', cfg)).toEqual([...BUILTIN_MODELS.copilot]);
  });

  it('empty user list falls back to built-in', () => {
    const cfg = { ...DEFAULT_AI_CONFIG, models: { claude: [] } };
    expect(getModelsForProvider('claude', cfg)).toEqual([...BUILTIN_MODELS.claude]);
  });

  it('unknown provider returns empty list', () => {
    expect(getModelsForProvider('nope')).toEqual([]);
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

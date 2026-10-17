import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));

import { readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { getDefaultProjectConfig, readProjectConfig, writeProjectConfig } from './projectConfig';
import { CONFIG_FILE, DEFAULT_PREFIX } from '../utils/constants';

const mockRead = vi.mocked(readWorkspaceFile);
const mockWrite = vi.mocked(writeWorkspaceFile);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getDefaultProjectConfig', () => {
  it('returns the documented defaults', () => {
    expect(getDefaultProjectConfig()).toEqual({
      prefix: DEFAULT_PREFIX,
      testCommand: 'npm test',
      conventionsPath: '.sdd/conventions.md',
      skillsPath: '.sdd/skills',
    });
  });

  it('returns a fresh object each call', () => {
    const a = getDefaultProjectConfig();
    a.prefix = 'MUTATED';
    expect(getDefaultProjectConfig().prefix).toBe(DEFAULT_PREFIX);
  });
});

describe('readProjectConfig', () => {
  it('returns defaults when the file is missing', async () => {
    mockRead.mockResolvedValue(undefined);
    await expect(readProjectConfig()).resolves.toEqual(getDefaultProjectConfig());
    expect(mockRead).toHaveBeenCalledWith(CONFIG_FILE);
  });

  it('returns defaults when the file is empty or invalid JSON', async () => {
    mockRead.mockResolvedValue('');
    await expect(readProjectConfig()).resolves.toEqual(getDefaultProjectConfig());
    mockRead.mockResolvedValue('{ not json');
    await expect(readProjectConfig()).resolves.toEqual(getDefaultProjectConfig());
  });

  it('merges stored values over defaults and keeps extra keys', async () => {
    mockRead.mockResolvedValue(JSON.stringify({ prefix: 'SDD', ai: { provider: 'copilot' } }));
    await expect(readProjectConfig()).resolves.toEqual({
      ...getDefaultProjectConfig(),
      prefix: 'SDD',
      ai: { provider: 'copilot' },
    });
  });
});

describe('writeProjectConfig', () => {
  it('writes formatted JSON when no file exists', async () => {
    mockRead.mockResolvedValue(undefined);
    const config = { ...getDefaultProjectConfig(), prefix: 'NEW' };
    await writeProjectConfig(config);
    expect(mockWrite).toHaveBeenCalledWith(CONFIG_FILE, JSON.stringify(config, null, 2));
  });

  it('preserves keys it does not own (e.g. ai)', async () => {
    mockRead.mockResolvedValue(JSON.stringify({ prefix: 'OLD', ai: { model: 'opus' }, custom: 1 }));
    await writeProjectConfig({ ...getDefaultProjectConfig(), prefix: 'NEW' });
    const written = JSON.parse(mockWrite.mock.calls[0][1]);
    expect(written).toMatchObject({ prefix: 'NEW', ai: { model: 'opus' }, custom: 1 });
  });

  it('starts fresh when the existing file is corrupt', async () => {
    mockRead.mockResolvedValue('{{{');
    const config = getDefaultProjectConfig();
    await writeProjectConfig(config);
    expect(JSON.parse(mockWrite.mock.calls[0][1])).toEqual(config);
  });
});

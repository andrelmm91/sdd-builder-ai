import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (key: string) => settings.values[key] }) },
}));
vi.mock('./projectConfig', () => ({ readProjectConfig: vi.fn() }));

import { readProjectConfig } from './projectConfig';
import {
  getProviderBinary,
  getCliNotFoundMessage,
  getSpecPrefix,
  getTestCommand,
  getClaudeCliBinary,
  getDefaultBudget,
  getAutoValidate,
} from './extensionConfig';
import { DEFAULT_BUDGET } from '../utils/constants';
import type { ProjectConfig } from './projectConfig';

const mockReadProjectConfig = vi.mocked(readProjectConfig);

beforeEach(() => {
  settings.values = {};
  mockReadProjectConfig.mockReset();
  mockReadProjectConfig.mockResolvedValue({
    prefix: 'PROJ',
    testCommand: 'pnpm test',
    conventionsPath: '',
    skillsPath: '',
  } satisfies ProjectConfig);
});

describe('getProviderBinary', () => {
  it('returns the Claude binary for provider claude', () => {
    expect(getProviderBinary({ provider: 'claude' })).toBe('claude');
  });
  it('returns gh for provider copilot', () => {
    expect(getProviderBinary({ provider: 'copilot' })).toBe('gh');
  });
  it('falls back to the Claude binary when provider is undefined', () => {
    expect(getProviderBinary(undefined)).toBe('claude');
    expect(getProviderBinary({})).toBe('claude');
  });
  it('applies the claudeCliBinary setting only to claude', () => {
    settings.values.claudeCliBinary = '/usr/local/bin/claude';
    expect(getProviderBinary({ provider: 'claude' })).toBe('/usr/local/bin/claude');
    expect(getProviderBinary({ provider: 'copilot' })).toBe('gh');
  });
});

describe('getCliNotFoundMessage', () => {
  it('names the provider and binary; Claude mentions the setting', () => {
    expect(getCliNotFoundMessage({ provider: 'copilot' }, 'gh')).toBe(
      'Copilot CLI not found: "gh". Install it or update your AI configuration.'
    );
    expect(getCliNotFoundMessage(undefined, 'claude')).toBe(
      'Claude CLI not found: "claude". Install it or update your AI configuration. (setting: sdd.claudeCliBinary)'
    );
  });

  it('uses the label of a custom provider', () => {
    const customProviders = [{
      id: 'aider', label: 'Aider', binary: 'aider',
      permissionModes: [{ id: 'default', label: 'Default', mode: 'interactive' }],
      fileRefFormat: '{path}',
    }];
    const msg = getCliNotFoundMessage({ provider: 'aider', customProviders } as never, 'aider');
    expect(msg).toBe('Aider CLI not found: "aider". Install it or update your AI configuration.');
  });
});

describe('getSpecPrefix / getTestCommand', () => {
  it('prefer the VS Code setting when set', async () => {
    settings.values = { specPrefix: 'SET', testCommand: 'make test' };
    await expect(getSpecPrefix()).resolves.toBe('SET');
    await expect(getTestCommand()).resolves.toBe('make test');
    expect(mockReadProjectConfig).not.toHaveBeenCalled();
  });

  it('fall back to .sdd/config.json when the setting is unset or empty', async () => {
    settings.values = { specPrefix: '' };
    await expect(getSpecPrefix()).resolves.toBe('PROJ');
    await expect(getTestCommand()).resolves.toBe('pnpm test');
  });
});

describe('simple settings', () => {
  it('getClaudeCliBinary defaults to claude', () => {
    expect(getClaudeCliBinary()).toBe('claude');
    settings.values.claudeCliBinary = 'cl';
    expect(getClaudeCliBinary()).toBe('cl');
  });

  it('getDefaultBudget defaults when unset or zero', () => {
    expect(getDefaultBudget()).toBe(DEFAULT_BUDGET);
    settings.values.defaultBudget = 0;
    expect(getDefaultBudget()).toBe(DEFAULT_BUDGET);
    settings.values.defaultBudget = 5000;
    expect(getDefaultBudget()).toBe(5000);
  });

  it('getAutoValidate defaults to true but respects false', () => {
    expect(getAutoValidate()).toBe(true);
    settings.values.autoValidate = false;
    expect(getAutoValidate()).toBe(false);
  });
});

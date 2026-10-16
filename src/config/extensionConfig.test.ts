import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));
vi.mock('./projectConfig', () => ({ readProjectConfig: vi.fn() }));

import { getProviderBinary, getCliNotFoundMessage } from './extensionConfig';

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
});

describe('getCliNotFoundMessage', () => {
  it('names the provider and binary; Claude mentions the setting', () => {
    expect(getCliNotFoundMessage({ provider: 'copilot' }, 'gh')).toBe(
      'Copilot CLI not found: "gh". Install it or update your AI configuration.'
    );
    expect(getCliNotFoundMessage(undefined, 'claude')).toContain('sdd.claudeCliBinary');
  });
});

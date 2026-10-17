import { describe, it, expect } from 'vitest';
import { buildCliCommand } from './cliCommandBuilder';
import { quoteForShell } from '../utils/shellQuote';
import type { AIConfig, RequirementsAIConfig } from '../config/aiConfigTypes';
import type { ProviderDefinition } from '../config/providerTypes';

const q = (s: string) => quoteForShell(s);

describe('buildCliCommand', () => {
  it('defaults to the claude provider with the default permission mode', () => {
    expect(buildCliCommand({ cliBinary: 'claude', prompt: 'hello' })).toBe(`claude ${q('hello')}`);
  });

  it('collapses newlines in the prompt to single spaces and trims', () => {
    const cmd = buildCliCommand({ cliBinary: 'claude', prompt: '\nline one\n\n\nline two\n' });
    expect(cmd).toBe(`claude ${q('line one line two')}`);
  });

  it('uses the cliBinary override for claude', () => {
    expect(buildCliCommand({ cliBinary: '/opt/bin/claude', prompt: 'x' })).toMatch(/^\/opt\/bin\/claude /);
  });

  it('adds --max-tokens and --effort for claude, before the prompt', () => {
    const aiConfig = { provider: 'claude', permissionMode: 'default', effort: 'high' } as Partial<AIConfig> as AIConfig;
    const cmd = buildCliCommand({ cliBinary: 'claude', aiConfig, prompt: 'p', maxTokens: 500 });
    expect(cmd).toBe(`claude --max-tokens 500 --effort high ${q('p')}`);
  });

  it('reads effort from a RequirementsAIConfig', () => {
    const aiConfig = { provider: 'claude', permissionMode: 'default', model: 'opus', effort: 'low' } as Partial<RequirementsAIConfig> as RequirementsAIConfig;
    const cmd = buildCliCommand({ cliBinary: 'claude', aiConfig, prompt: 'p' });
    expect(cmd).toContain('--model opus');
    expect(cmd).toContain('--effort low');
  });

  it('passes model and batch permission mode through', () => {
    const aiConfig = { provider: 'claude', permissionMode: 'dangerously-skip-permissions', model: 'claude-sonnet-4-5' } as Partial<AIConfig> as AIConfig;
    const cmd = buildCliCommand({ cliBinary: 'claude', aiConfig, prompt: 'go' });
    expect(cmd).toBe(`claude --model claude-sonnet-4-5 -p --dangerously-skip-permissions ${q('go')}`);
  });

  it('omits claude-only flags for other providers and ignores the claude binary override', () => {
    const aiConfig = { provider: 'copilot', permissionMode: 'yolo', effort: 'high' } as Partial<AIConfig> as AIConfig;
    const cmd = buildCliCommand({ cliBinary: 'my-claude', aiConfig, prompt: 'go', maxTokens: 100 });
    expect(cmd).toBe(`gh copilot --yolo -p ${q('go')}`);
    expect(cmd).not.toContain('--max-tokens');
    expect(cmd).not.toContain('--effort');
  });

  it('prefers an explicit providerDef over the aiConfig provider', () => {
    const providerDef: ProviderDefinition = {
      id: 'custom',
      label: 'Custom',
      binary: 'mycli',
      permissionModes: [{ id: 'default', label: 'Default', mode: 'interactive' }],
      interactive: { args: ['run', '{prompt}'] },
      batch: { args: ['{prompt}'] },
      fileRefFormat: '@{path}',
    } as unknown as ProviderDefinition;
    const cmd = buildCliCommand({ cliBinary: 'claude', providerDef, prompt: 'go', maxTokens: 5 });
    expect(cmd).toBe(`mycli run ${q('go')}`);
  });
});

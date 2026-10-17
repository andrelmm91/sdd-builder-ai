import { describe, it, expect } from 'vitest';
import { BUILTIN_PROVIDERS } from '../config/providerTypes';
import type { ProviderDefinition } from '../config/providerTypes';
import { quoteForShell } from '../utils/shellQuote';
import {
  buildProviderCommand,
  formatFileRef,
  isBatchMode,
  resolveProviderBinary,
  resolveProviderDefinition,
} from './providerCommand';

const claude = BUILTIN_PROVIDERS.find((p) => p.id === 'claude')!;
const copilot = BUILTIN_PROVIDERS.find((p) => p.id === 'copilot')!;
const PROMPT = "Read and follow it's instructions";
const platforms: NodeJS.Platform[] = ['linux', 'win32'];

/** The command strings CliRunner produced before provider definitions existed. */
function legacyClaude(mode: string, model: string | undefined, platform: NodeJS.Platform): string {
  const parts = ['claude'];
  if (model) parts.push('--model', model);
  if (mode === 'dangerously-skip-permissions') parts.push('-p', '--dangerously-skip-permissions');
  parts.push(quoteForShell(PROMPT, platform));
  return parts.join(' ');
}

function legacyCopilot(mode: string, platform: NodeJS.Platform): string {
  const q = quoteForShell(PROMPT, platform);
  return mode === 'yolo' ? `gh copilot --yolo -p ${q}` : `gh copilot ${q}`;
}

describe('buildProviderCommand — built-in snapshots', () => {
  for (const platform of platforms) {
    for (const mode of claude.permissionModes) {
      for (const model of [undefined, 'claude-sonnet-4-5']) {
        it(`claude ${mode.id} ${model ?? 'no model'} on ${platform}`, () => {
          const result = buildProviderCommand(claude, { permissionModeId: mode.id, prompt: PROMPT, model, platform });
          expect(result.command).toBe(legacyClaude(mode.id, model, platform));
          expect(result.interactive).toBe(mode.id !== 'dangerously-skip-permissions');
        });
      }
    }
    for (const mode of copilot.permissionModes) {
      it(`copilot ${mode.id} on ${platform}`, () => {
        const result = buildProviderCommand(copilot, { permissionModeId: mode.id, prompt: PROMPT, platform });
        expect(result.command).toBe(legacyCopilot(mode.id, platform));
        expect(result.interactive).toBe(mode.id !== 'yolo');
      });
    }
  }

  it('ignores the model for a provider without modelArgs', () => {
    const { command } = buildProviderCommand(copilot, { permissionModeId: 'default', prompt: 'p', model: 'gpt-5', platform: 'linux' });
    expect(command).toBe("gh copilot 'p'");
  });

  it('uses the binary override', () => {
    const { command } = buildProviderCommand(claude, {
      permissionModeId: 'default', prompt: 'p', binaryOverride: '/opt/claude', platform: 'linux',
    });
    expect(command).toBe("/opt/claude 'p'");
  });
});

describe('buildProviderCommand — custom provider', () => {
  const custom: ProviderDefinition = {
    id: 'gemini',
    label: 'Gemini CLI',
    binary: 'gemini',
    fileRefFormat: '@{path}',
    batch: { args: ['--prompt', '{prompt}'] },
    interactive: { args: ['-i', '{prompt}'] },
    modelArgs: ['-m', '{model}'],
    permissionModes: [
      { id: 'ask', label: 'Ask', mode: 'interactive' },
      { id: 'auto', label: 'Auto', mode: 'batch', extraArgs: ['--yolo'] },
    ],
  };

  it('builds batch commands with extraArgs and model', () => {
    const result = buildProviderCommand(custom, { permissionModeId: 'auto', prompt: 'do it', model: 'gem-2', platform: 'linux' });
    expect(result).toEqual({ command: "gemini -m gem-2 --yolo --prompt 'do it'", interactive: false });
  });

  it('builds interactive commands and omits the model when unset', () => {
    const result = buildProviderCommand(custom, { permissionModeId: 'ask', prompt: 'do it', platform: 'linux' });
    expect(result).toEqual({ command: "gemini -i 'do it'", interactive: true });
  });

  it('quotes a model that is not a plain token', () => {
    const { command } = buildProviderCommand(custom, { permissionModeId: 'ask', prompt: 'p', model: 'a b', platform: 'linux' });
    expect(command).toBe("gemini -m 'a b' -i 'p'");
  });

  it('falls back to the first permission mode for an unknown id', () => {
    const result = buildProviderCommand(custom, { permissionModeId: 'nope', prompt: 'p', platform: 'linux' });
    expect(result).toEqual({ command: "gemini -i 'p'", interactive: true });
  });

  it('inserts opts.extraArgs before the invocation args', () => {
    const { command } = buildProviderCommand(custom, {
      permissionModeId: 'ask', prompt: 'p', extraArgs: ['--x', '1'], platform: 'linux',
    });
    expect(command).toBe("gemini --x 1 -i 'p'");
  });
});

describe('helpers', () => {
  it('isBatchMode reflects the permission mode and falls back to the first mode', () => {
    expect(isBatchMode(claude, 'dangerously-skip-permissions')).toBe(true);
    expect(isBatchMode(claude, 'plan')).toBe(false);
    expect(isBatchMode(claude, 'unknown')).toBe(false);
    expect(isBatchMode(copilot, 'yolo')).toBe(true);
  });

  it('formatFileRef substitutes the path', () => {
    expect(formatFileRef(claude, 'a/b.md')).toBe('@a/b.md');
    expect(formatFileRef(copilot, 'a/b.md')).toBe('#file:a/b.md');
  });

  it('resolveProviderDefinition finds custom providers and defaults to claude', () => {
    const custom = { ...claude, id: 'mine', binary: 'mine' };
    expect(resolveProviderDefinition({ provider: 'mine', customProviders: [custom] })).toBe(custom);
    expect(resolveProviderDefinition(undefined).id).toBe('claude');
    expect(resolveProviderDefinition({ provider: 'copilot' }).id).toBe('copilot');
  });

  it('resolveProviderBinary applies the override to claude only', () => {
    expect(resolveProviderBinary(claude, '/x/claude')).toBe('/x/claude');
    expect(resolveProviderBinary(copilot, '/x/claude')).toBe('gh');
  });
});

import { describe, it, expect } from 'vitest';
import { BUILTIN_MODELS } from './aiConfigTypes';
import {
  BUILTIN_PROVIDERS,
  getProviderDefinition,
  resolveProviderModels,
  validateProviderDefinition,
  validateProviderList,
  type ProviderDefinition,
} from './providerTypes';

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'codex',
    label: 'Codex',
    binary: 'codex',
    fileRefFormat: '@{path}',
    batch: { args: ['exec', '{prompt}'] },
    interactive: { args: ['{prompt}'] },
    modelArgs: ['--model', '{model}'],
    models: ['gpt-5.5'],
    permissionModes: [
      { id: 'ask', label: 'Ask', mode: 'interactive' },
      { id: 'auto', label: 'Auto', mode: 'batch', extraArgs: ['--full-auto'] },
    ],
    ...overrides,
  };
}

const paths = (def: unknown) => validateProviderDefinition(def).map((e) => e.path);

describe('BUILTIN_PROVIDERS', () => {
  it('contains claude and copilot with models from BUILTIN_MODELS', () => {
    expect(BUILTIN_PROVIDERS.map((p) => p.id)).toEqual(['claude', 'copilot']);
    expect(getProviderDefinition('claude')?.models).toEqual([...BUILTIN_MODELS.claude]);
    expect(getProviderDefinition('copilot')?.models).toEqual([...BUILTIN_MODELS.copilot]);
  });

  it('reproduces the current command shapes', () => {
    const claude = getProviderDefinition('claude')!;
    expect(claude.batch?.args).toEqual(['-p', '--dangerously-skip-permissions', '{prompt}']);
    expect(claude.interactive?.args).toEqual(['{prompt}']);
    const copilot = getProviderDefinition('copilot')!;
    expect(copilot.binary).toBe('gh');
    expect(copilot.batch?.args).toEqual(['copilot', '--yolo', '-p', '{prompt}']);
    expect(copilot.interactive?.args).toEqual(['copilot', '{prompt}']);
  });

  it.each(BUILTIN_PROVIDERS.map((p) => [p.id, p] as const))('%s passes validation', (_id, def) => {
    expect(validateProviderDefinition(def)).toEqual([]);
  });

  it('passes list validation', () => {
    expect(validateProviderList(BUILTIN_PROVIDERS)).toEqual([]);
  });
});

describe('getProviderDefinition', () => {
  it('returns undefined for an unknown id', () => {
    expect(getProviderDefinition('nope')).toBeUndefined();
  });

  it('finds a custom definition', () => {
    const custom = valid() as unknown as ProviderDefinition;
    expect(getProviderDefinition('codex', [custom])).toBe(custom);
  });

  it('lets a custom definition override a built-in with the same id', () => {
    const custom = valid({ id: 'claude', label: 'My Claude' }) as unknown as ProviderDefinition;
    expect(getProviderDefinition('claude', [custom])?.label).toBe('My Claude');
  });
});

describe('resolveProviderModels', () => {
  const def = getProviderDefinition('claude')!;

  it('uses the definition models without user models', () => {
    expect(resolveProviderModels(def)).toEqual(def.models);
    expect(resolveProviderModels(def, { claude: [] })).toEqual(def.models);
  });

  it('prefers a non-empty user list', () => {
    expect(resolveProviderModels(def, { claude: ['x'] })).toEqual(['x']);
  });

  it('returns [] when there are no models at all', () => {
    expect(resolveProviderModels(valid({ models: undefined }) as unknown as ProviderDefinition)).toEqual([]);
  });
});

describe('validateProviderDefinition', () => {
  it('accepts a valid definition', () => {
    expect(validateProviderDefinition(valid())).toEqual([]);
  });

  it('rejects a non-object', () => {
    expect(validateProviderDefinition('x')).toHaveLength(1);
  });

  it('reports a missing binary', () => {
    expect(paths(valid({ binary: undefined }))).toContain('binary');
  });

  it('reports a binary with a space', () => {
    expect(paths(valid({ binary: 'my cli' }))).toContain('binary');
  });

  it('accepts a binary path', () => {
    expect(paths(valid({ binary: 'C:\\tools\\codex.exe' }))).toEqual([]);
  });

  it('reports a bad id', () => {
    expect(paths(valid({ id: 'Bad Id' }))).toContain('id');
  });

  it('reports a bad label', () => {
    expect(paths(valid({ label: '' }))).toContain('label');
    expect(paths(valid({ label: 'x'.repeat(61) }))).toContain('label');
  });

  it('reports fileRefFormat without {path}', () => {
    expect(paths(valid({ fileRefFormat: '@file' }))).toContain('fileRefFormat');
    expect(paths(valid({ fileRefFormat: '{path}{path}' }))).toContain('fileRefFormat');
  });

  it('requires batch or interactive', () => {
    const errs = validateProviderDefinition(valid({ batch: undefined, interactive: undefined, permissionModes: [{ id: 'a', label: 'A', mode: 'batch' }] }));
    expect(errs.some((e) => e.message.includes('at least one'))).toBe(true);
  });

  it('reports an invocation without {prompt}', () => {
    expect(paths(valid({ batch: { args: ['exec'] } }))).toContain('batch.args');
  });

  it('reports {prompt} appearing twice', () => {
    expect(paths(valid({ batch: { args: ['{prompt}', '{prompt}'] } }))).toContain('batch.args');
  });

  it('reports an unknown placeholder with the arg index', () => {
    expect(paths(valid({ batch: { args: ['exec', '{nope}', '{prompt}'] } }))).toContain('batch.args[1]');
  });

  it('reports {prompt} in extraArgs and modelArgs', () => {
    const perm = [{ id: 'auto', label: 'Auto', mode: 'batch', extraArgs: ['x', '{prompt}'] }];
    expect(paths(valid({ permissionModes: perm }))).toContain('permissionModes[0].extraArgs[1]');
    expect(paths(valid({ modelArgs: ['{model}', '{prompt}'] }))).toContain('modelArgs[1]');
  });

  it('requires {model} in modelArgs', () => {
    expect(paths(valid({ modelArgs: ['--model'] }))).toContain('modelArgs');
  });

  it('reports empty and multi-line args', () => {
    expect(paths(valid({ batch: { args: ['', '{prompt}'] } }))).toContain('batch.args[0]');
    expect(paths(valid({ batch: { args: ['a\nb', '{prompt}'] } }))).toContain('batch.args[0]');
  });

  it('reports a non-string arg', () => {
    expect(paths(valid({ batch: { args: [1, '{prompt}'] } }))).toContain('batch.args[0]');
  });

  it('reports a mode without a matching invocation', () => {
    const errs = paths(valid({ interactive: undefined }));
    expect(errs).toContain('permissionModes[0].mode');
  });

  it('reports duplicate permission mode ids', () => {
    const perm = [
      { id: 'a', label: 'A', mode: 'batch' },
      { id: 'a', label: 'B', mode: 'batch' },
    ];
    expect(paths(valid({ permissionModes: perm }))).toContain('permissionModes[1].id');
  });

  it('requires non-empty permissionModes', () => {
    expect(paths(valid({ permissionModes: [] }))).toContain('permissionModes');
  });

  it('reports an invalid or duplicate model id', () => {
    expect(paths(valid({ models: ['ok', 'bad model'] }))).toContain('models[1]');
    expect(paths(valid({ models: ['a', 'a'] }))).toContain('models[1]');
  });
});

describe('validateProviderList', () => {
  it('prefixes paths with the index', () => {
    const errs = validateProviderList([valid(), valid({ id: 'other', binary: 'a b' })]);
    expect(errs.map((e) => e.path)).toEqual(['[1].binary']);
  });

  it('reports duplicate provider ids', () => {
    const errs = validateProviderList([valid(), valid()]);
    expect(errs).toEqual([{ path: '[1].id', message: 'duplicate provider id "codex"' }]);
  });
});

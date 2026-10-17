import { describe, it, expect } from 'vitest';
import {
  CLAUDE_MODELS,
  COPILOT_MODELS,
  BUILTIN_MODELS,
  DEFAULT_REQUIREMENTS_AI_CONFIG,
  CLAUDE_PERMISSION_MODES,
  COPILOT_PERMISSION_MODES,
  DEFAULT_PRE_PROMPT,
  LEGACY_PRE_PROMPT,
  DEFAULT_AI_CONFIG,
  MODEL_ID_PATTERN,
} from './aiConfigTypes';
import type { AIProvider, AIConfig, TagSkillMapping, PermissionMode } from './aiConfigTypes';

describe('MODEL_ID_PATTERN', () => {
  it.each(['fable', 'opus[1m]', 'claude-opus-5-5', 'gpt-5.5', 'org/model:tag'])('accepts %s', (id) => {
    expect(MODEL_ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['', 'my model', 'a"b', "a'b", 'a'.repeat(101)])('rejects %j', (id) => {
    expect(MODEL_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('aiConfigTypes', () => {
  it('exports CLAUDE_MODELS', () => {
    expect(CLAUDE_MODELS).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'opus[1m]', 'sonnet[1m]']);
    expect(CLAUDE_MODELS).toContain('fable');
  });

  it('exports BUILTIN_MODELS containing the default models', () => {
    expect(BUILTIN_MODELS.claude).toBe(CLAUDE_MODELS);
    expect(BUILTIN_MODELS.copilot).toBe(COPILOT_MODELS);
    expect(BUILTIN_MODELS.claude).toContain(DEFAULT_AI_CONFIG.model);
    expect(BUILTIN_MODELS.claude).toContain(DEFAULT_REQUIREMENTS_AI_CONFIG.model);
  });

  it('exports COPILOT_MODELS', () => {
    expect(COPILOT_MODELS).toEqual([
      'claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5',
      'claude-sonnet-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5',
      'claude-opus-4.6', 'claude-opus-4.6-fast', 'claude-opus-4.5', 'claude-sonnet-4',
      'gemini-3-pro-preview',
      'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2',
      'gpt-5.1-codex-max', 'gpt-5.1-codex', 'gpt-5.1', 'gpt-5.1-codex-mini',
      'gpt-5-mini', 'gpt-4.1',
    ]);
  });

  it('exports CLAUDE_PERMISSION_MODES', () => {
    expect(CLAUDE_PERMISSION_MODES).toEqual(['default', 'dangerously-skip-permissions', 'plan']);
  });

  it('exports COPILOT_PERMISSION_MODES', () => {
    expect(COPILOT_PERMISSION_MODES).toEqual(['default', 'yolo']);
  });

  it('exports DEFAULT_PRE_PROMPT', () => {
    expect(DEFAULT_PRE_PROMPT).toContain('{spec_file}');
    expect(DEFAULT_PRE_PROMPT).not.toContain('status to review');
  });

  it('exports LEGACY_PRE_PROMPT as the old default', () => {
    expect(LEGACY_PRE_PROMPT).toContain('status to review');
    expect(LEGACY_PRE_PROMPT).not.toBe(DEFAULT_PRE_PROMPT);
  });

  it('exports DEFAULT_AI_CONFIG with correct defaults', () => {
    expect(DEFAULT_AI_CONFIG).toEqual({
      provider: 'claude',
      permissionMode: 'default',
      model: 'sonnet',
      effort: 'medium',
      tagSkillMappings: [],
      prePromptTemplate: DEFAULT_PRE_PROMPT,
      commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
      commitCommandEnabled: false,
      prCommand: 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"',
      prCommandEnabled: false,
      timeoutMultiplier: 1,
    });
  });

  it('types are assignable correctly', () => {
    const provider: AIProvider = 'copilot';
    const mode: PermissionMode = 'yolo';
    const mapping: TagSkillMapping = { tag: 'backend', skill: 'backend-dev' };
    const config: AIConfig = {
      provider,
      permissionMode: mode,
      model: 'gpt-4o',
      tagSkillMappings: [mapping],
      prePromptTemplate: 'test',
    };
    expect(config.provider).toBe('copilot');
  });
});

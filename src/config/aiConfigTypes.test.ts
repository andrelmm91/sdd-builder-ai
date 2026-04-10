import { describe, it, expect } from 'vitest';
import {
  CLAUDE_MODELS,
  COPILOT_MODELS,
  CLAUDE_PERMISSION_MODES,
  COPILOT_PERMISSION_MODES,
  DEFAULT_PRE_PROMPT,
  DEFAULT_AI_CONFIG,
} from './aiConfigTypes';
import type { AIProvider, AIConfig, TagSkillMapping, PermissionMode } from './aiConfigTypes';

describe('aiConfigTypes', () => {
  it('exports CLAUDE_MODELS', () => {
    expect(CLAUDE_MODELS).toEqual(['opus', 'sonnet', 'haiku']);
  });

  it('exports COPILOT_MODELS', () => {
    expect(COPILOT_MODELS).toEqual([
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

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
    expect(COPILOT_MODELS).toEqual(['claude-sonnet-4.6', 'gpt-4o']);
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
      tagSkillMappings: [],
      prePromptTemplate: DEFAULT_PRE_PROMPT,
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

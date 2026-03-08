export type AIProvider = 'claude' | 'copilot';

export type ClaudePermissionMode = 'default' | 'dangerously-skip-permissions' | 'plan';
export type CopilotPermissionMode = 'default' | 'yolo';
export type PermissionMode = ClaudePermissionMode | CopilotPermissionMode;

export interface TagSkillMapping {
  tag: string;
  skill: string;
}

export interface AIConfig {
  provider: AIProvider;
  permissionMode: PermissionMode;
  model: string;
  tagSkillMappings: TagSkillMapping[];
  prePromptTemplate: string;
}

export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export const COPILOT_MODELS = ['claude-sonnet-4.6', 'gpt-4o', 'gpt-5.1', 'codex', 'opus'] as const;

export const CLAUDE_PERMISSION_MODES: readonly ClaudePermissionMode[] = [
  'default',
  'dangerously-skip-permissions',
  'plan',
] as const;

export const COPILOT_PERMISSION_MODES: readonly CopilotPermissionMode[] = [
  'default',
  'yolo',
] as const;

export const DEFAULT_PRE_PROMPT =
  'Implement {spec_file}. Update open tasks in the spec after completion. Add unit tests if necessary. Commit with the SDD spec_id as message.';

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'claude',
  permissionMode: 'default',
  model: 'sonnet',
  tagSkillMappings: [],
  prePromptTemplate: DEFAULT_PRE_PROMPT,
};

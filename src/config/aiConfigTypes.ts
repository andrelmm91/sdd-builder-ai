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
  commitCommand: string;
  commitCommandEnabled: boolean;
  prCommand: string;
  prCommandEnabled: boolean;
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
  'Implement {spec_file}. Update open tasks and status (done) in the spec after completion. Add unit tests if necessary.';

export const DEFAULT_COMMIT_COMMAND = 'git add -A && git commit -m "{spec_id}: {title}"';
export const DEFAULT_PR_COMMAND = 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"';

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'claude',
  permissionMode: 'default',
  model: 'sonnet',
  tagSkillMappings: [],
  prePromptTemplate: DEFAULT_PRE_PROMPT,
  commitCommand: DEFAULT_COMMIT_COMMAND,
  commitCommandEnabled: false,
  prCommand: DEFAULT_PR_COMMAND,
  prCommandEnabled: false,
};

export interface RequirementsAIConfig {
  provider: AIProvider;
  model: string;
  permissionMode: PermissionMode;
  idealizePromptTemplate: string;
  createSddCardsPromptTemplate: string;
}

export const DEFAULT_IDEALIZE_PROMPT =
  'Based on the following feature description, acceptance criteria and notes ' +
  'in @{feature_path}, create a new markdown file ' +
  '(named idealization.md) in the same folder with a concise idealization of this feature. ' +
  'Make sure to include all the important information and recommendations. ' +
  'The idealization should be clear and easy to understand for the development team.';

export const DEFAULT_CREATE_SDD_CARDS_PROMPT =
  'Create new phases and SDDs in @{specs_folder}/ to fulfill the requirements ' +
  'in @{idealization_path} by using skills ' +
  'in @.claude/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed.';

export const DEFAULT_REQUIREMENTS_AI_CONFIG: RequirementsAIConfig = {
  provider: 'claude',
  model: 'sonnet',
  permissionMode: 'default',
  idealizePromptTemplate: DEFAULT_IDEALIZE_PROMPT,
  createSddCardsPromptTemplate: DEFAULT_CREATE_SDD_CARDS_PROMPT,
};

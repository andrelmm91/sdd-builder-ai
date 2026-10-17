import type { ProviderDefinition } from './providerTypes';

/** Provider id: a built-in (`BUILTIN_PROVIDER_IDS`) or a custom provider's id. */
export type AIProvider = string;

export const BUILTIN_PROVIDER_IDS = ['claude', 'copilot'] as const;

export type ClaudeEffort = 'low' | 'medium' | 'high';
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
  effort?: ClaudeEffort;
  tagSkillMappings: TagSkillMapping[];
  prePromptTemplate: string;
  commitCommand?: string;
  commitCommandEnabled?: boolean;
  prCommand?: string;
  prCommandEnabled?: boolean;
  /** User-defined model lists keyed by provider id; replaces the built-in list for that provider. */
  models?: Record<string, string[]>;
  /** User-defined agent CLIs; override built-ins by `id`. Owned by `writeCustomProviders()`. */
  customProviders?: ProviderDefinition[];
}

export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'opus[1m]', 'sonnet[1m]'] as const;
export const COPILOT_MODELS = [
  'claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5',
  'claude-sonnet-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5',
  'claude-opus-4.6', 'claude-opus-4.6-fast', 'claude-opus-4.5', 'claude-sonnet-4',
  'gemini-3-pro-preview',
  'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2',
  'gpt-5.1-codex-max', 'gpt-5.1-codex', 'gpt-5.1', 'gpt-5.1-codex-mini',
  'gpt-5-mini', 'gpt-4.1',
] as const;

export const BUILTIN_MODELS: Record<string, readonly string[]> = {
  claude: CLAUDE_MODELS,
  copilot: COPILOT_MODELS,
};

/** Accepted shape of a user-defined model id (e.g. `opus[1m]`, `gpt-5.5`, `org/model:tag`). */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._:@/[\]-]{1,100}$/;

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
  'Implement {spec_file}. Tick the acceptance criteria checkboxes you have verified. Do not modify the spec frontmatter; status is managed by SDD.';

/** Previous default, which asked the AI to edit the spec status. Migrated to DEFAULT_PRE_PROMPT on read. */
export const LEGACY_PRE_PROMPT =
  'Implement {spec_file}. Update open tasks and its status to review after completion.';

export const DEFAULT_COMMIT_COMMAND = 'git add -A && git commit -m "{spec_id}: {title}"';
export const DEFAULT_PR_COMMAND = 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"';

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'claude',
  permissionMode: 'default',
  model: 'sonnet',
  effort: 'medium',
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
  effort: ClaudeEffort;
  idealizePromptTemplate: string;
  createSddCardsPromptTemplate: string;
}

export const DEFAULT_IDEALIZE_PROMPT =
  'You are acting as a Senior Tech Lead and Software Architect. ' +
  'Follow the skill instructions in {file_prefix}.sdd/skills/idealize-requirements/SKILL.md. ' +
  'Analyze the feature description in {file_prefix}{feature_path} and produce a complete technical idealization. ' +
  'Create idealization.md in the same folder as the feature file, following the output format defined in the skill. ' +
  'The idealization must include: technical architecture, implementation plan with ordered phases, ' +
  'automated and manual acceptance criteria, technical risks with mitigations, ' +
  'concrete recommendations grounded in the existing codebase, and all open questions that must be resolved before implementation.';

export const DEFAULT_CREATE_SDD_CARDS_PROMPT =
  'Create new phases and SDDs in {file_prefix}{specs_folder}/ to fulfill the requirements ' +
  'in {file_prefix}{idealization_path} by using skills ' +
  'in {file_prefix}.sdd/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed.';

export const DEFAULT_REQUIREMENTS_AI_CONFIG: RequirementsAIConfig = {
  provider: 'claude',
  model: 'sonnet',
  permissionMode: 'default',
  effort: 'medium',
  idealizePromptTemplate: DEFAULT_IDEALIZE_PROMPT,
  createSddCardsPromptTemplate: DEFAULT_CREATE_SDD_CARDS_PROMPT,
};

---
spec_id: SDD-080
title: Add separate AI config for requirements commands and use configurable prompts
status: done
priority: high
complexity: medium
tags: [phase-2, feature, backend, ai]
relevant_files:
  - src/config/aiConfig.ts
  - src/config/aiConfigTypes.ts
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
must_not_touch:
  - src/execution/cliRunner.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-078]
agent_skills: fullstack-dev
created: 2026-03-10
---

## Context

Currently, `idealizeRequirements.ts` calls `readAIConfig()` which reads the `ai` key from `.sdd/config.json`. This gives requirements commands the same AI config as SDD execution. The requirement is to have a **separate** AI config for requirements commands (idealize + create-SDD-cards), stored under a different key (e.g., `requirementsAi`) in `config.json`.

Also, `buildIdealizePrompt()` and `buildCreateSddCardsPrompt()` are hardcoded strings in the command files. These should be replaced with configurable prompt templates stored in the config, similar to how `prePromptTemplate` works for SDD execution. This allows updating prompts without changing code.

The `AI_CONFIG_FILE` constant (`.sdd/ai-config.json`) already exists in `constants.ts`. The requirements config should be stored as the `requirementsAi` key in the existing `.sdd/config.json` (same file, separate key) to keep the config consolidated.

## Requirements

### Functional
- Add a `RequirementsAIConfig` type in `aiConfigTypes.ts` with fields: `provider`, `model`, `permissionMode`, `idealizePromptTemplate`, `createSddCardsPromptTemplate`.
- Add `DEFAULT_REQUIREMENTS_AI_CONFIG` with sensible defaults including the current hardcoded prompt texts as default values for the prompt templates.
- Add `readRequirementsAIConfig()` and `writeRequirementsAIConfig()` to `aiConfig.ts` that read/write a `requirementsAi` key in `.sdd/config.json`.
- Update `idealizeRequirements.ts` to call `readRequirementsAIConfig()` and use `config.idealizePromptTemplate` instead of the hardcoded `buildIdealizePrompt()`. The template must support a `{feature_path}` placeholder.
- Update `createSddCards.ts` to call `readRequirementsAIConfig()` and use `config.createSddCardsPromptTemplate`. The template must support `{idealization_path}` and `{specs_folder}` placeholders.
- Expose `requirementsAi` config in `AiConfigPanel.ts`: add `requestRequirementsConfig` / `saveRequirementsConfig` message handlers.
- Update `AiConfig.svelte` to include a second tab or section for "Requirements AI Config" with provider/model/permissionMode dropdowns and two textarea inputs for the prompt templates.

### Non-Functional
- Saving requirements config must not overwrite the SDD execution config
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [x] `npm run type-check` passes
- [x] `npm run build` succeeds

### Manual
- [ ] AI Config panel shows both "SDD Execution" and "Requirements" configuration sections
- [ ] Saving requirements config writes `requirementsAi` key to `.sdd/config.json`
- [ ] Idealize and Create SDD Cards commands use the prompt from config, not hardcoded strings
- [ ] Changing the prompt template in the config changes the actual prompt sent to the CLI

## Constraints
- Do not rename or remove the existing `ai` key in `config.json` — must remain backward-compatible
- Do not modify `cliRunner.ts` or `executeSpec.ts`

---
spec_id: SDD-111-BUGFIX
title: Update model lists and let users override them per provider
status: review
priority: high
complexity: medium
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/config/aiConfigTypes.ts
  - src/config/aiConfig.ts
  - src/views/webviews/aiConfig/AiConfigPanel.ts
  - webview-ui/src/aiConfig/AiConfig.svelte
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/cliCommandBuilder.ts
  - webview-ui/src/lib/vscode.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
The model lists offered in AI Configuration are out of date, and they are defined twice:

- `CLAUDE_MODELS` and `COPILOT_MODELS` in `src/config/aiConfigTypes.ts` (used only by tests and backend code).
- A separate hard-coded `MODELS` map in `webview-ui/src/aiConfig/AiConfig.svelte` (around line 58), which is what the UI actually renders.

**Current (broken) behavior:**
- Claude offers only `opus`, `sonnet` and `haiku`. These aliases still resolve to the newest Opus, Sonnet and Haiku in Claude Code, but `fable` (Claude Fable 5.1, the most capable model), `opusplan` and the 1M-context variants (`opus[1m]`, `sonnet[1m]`) are missing.
- Copilot lists only Claude 4.x models (`claude-opus-4.6`, `claude-sonnet-4.6`, `claude-haiku-4.5`), while GitHub's docs now list Claude Opus 5.5 and Sonnet 5.5. The GPT and Gemini entries are also likely stale.
- The model field is a `<select>`, so a model saved in `.sdd/config.json` that is not in the hard-coded list cannot be displayed or kept from the UI.

**Expected behavior:**
- One source of truth for built-in model suggestions, sent from the extension to the webview.
- Builders can define their own model list per provider in `.sdd/config.json`, without waiting for an extension release. A user-defined list **replaces** the built-in list for that provider.
- A currently saved model is always shown, even if it is in neither list.

**Root cause:** Model lists are hard-coded in two places and are not configurable.

**Reproduce:** Open AI Configuration with provider Claude and try to select Fable; it is not offered. Set `"model": "fable"` in `.sdd/config.json` and reopen the form; the select does not show it.

## Requirements
### Functional
- In `src/config/aiConfigTypes.ts`:
  - Update `CLAUDE_MODELS` to `['opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'opus[1m]', 'sonnet[1m]']`.
  - Update `COPILOT_MODELS` so the Claude entries start with the current generation: `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`, followed by the existing entries. **Builder decision:** confirm the exact Copilot model ID strings (for example by running `/model` in the installed Copilot CLI) and refresh the GPT and Gemini entries before promoting to `ready`.
  - Export `BUILTIN_MODELS: Record<string, readonly string[]>` = `{ claude: CLAUDE_MODELS, copilot: COPILOT_MODELS }`.
  - Add an optional `models?: Record<string, string[]>` to `AIConfig`: user-defined model lists keyed by provider id.
- In `src/config/aiConfig.ts`:
  - `readAIConfig()` reads `ai.models`, keeping only entries whose value is an array of non-empty strings (trimmed, de-duplicated). Invalid entries are dropped with a `console.warn`.
  - `writeAIConfig()` preserves `ai.models`.
  - Export `getModelsForProvider(provider: string, aiConfig?: AIConfig): string[]`. It returns `aiConfig.models[provider]` when that list is defined and non-empty, otherwise `BUILTIN_MODELS[provider]`, otherwise `[]`.
- In `src/views/webviews/aiConfig/AiConfigPanel.ts`, add `models: Record<string, string[]>` to the `configData` message, resolved with `getModelsForProvider` for every built-in provider. The same per-provider lists are used for both the execution and requirements sections of the form.
- In `webview-ui/src/aiConfig/AiConfig.svelte`:
  - Remove the hard-coded `MODELS` map and use the `models` received in `configData`. Before the first message arrives, use an empty list.
  - The model options for each section are the provider's list plus the currently saved model when it is not in that list, so the saved value is never lost.
  - When the provider changes, the model resets to the first entry of the new provider's list (today's behavior).
  - Show a short hint under each model field: `Add or replace models in .sdd/config.json under ai.models.<provider>.`

### Non-Functional
- Projects without `ai.models` see the updated built-in lists and no other change.
- No new dependencies.

## Acceptance Criteria
### Automated
- [x] `src/config/aiConfigTypes.test.ts` asserts the updated lists, that `fable` is in `CLAUDE_MODELS`, and that `DEFAULT_AI_CONFIG.model` and `DEFAULT_REQUIREMENTS_AI_CONFIG.model` are in `BUILTIN_MODELS.claude`.
- [x] `src/config/aiConfig.test.ts` covers `getModelsForProvider` for: no user models (built-in), a user list for `claude` (replaces built-in), an empty user list (falls back to built-in), an unknown provider (empty list), invalid `ai.models` entries dropped, and `writeAIConfig` round-tripping `ai.models`.
- [x] `npm run build:webview` succeeds.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] AI Configuration offers `fable` for Claude, and Copilot offers the 5.5 models.
- [x] Setting `"models": { "claude": ["fable", "claude-opus-5-5"] }` under `ai` in `.sdd/config.json` and reopening the form shows exactly those two models for Claude.
- [x] A saved model that is in no list (for example `claude-sonnet-5-5`) is still shown as selected, and saving keeps it.

## Examples
```json
"ai": {
  "provider": "claude",
  "model": "fable",
  "models": {
    "claude": ["fable", "opus", "sonnet", "claude-opus-5-5"],
    "copilot": ["claude-opus-5.5", "gpt-5.5"]
  }
}
```

## Constraints
- Do not change how the model is passed to the CLI (`--model` handling in `cliRunner.ts` and `cliCommandBuilder.ts`).
- Do not turn the model field into a free-text input; SDD-103 does that later. This spec keeps the `<select>`.
- Do not add a UI editor for `ai.models`.

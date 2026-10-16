---
spec_id: SDD-112-NEW
title: Edit and save per-provider model lists from the AI Config UI
status: done
priority: high
complexity: medium
tags:
  - rel-v2.0
  - feature
  - phase-1
  - ui
relevant_files:
  - webview-ui/src/aiConfig/AiConfig.svelte
  - src/views/webviews/aiConfig/AiConfigPanel.ts
  - src/config/aiConfig.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/cliCommandBuilder.ts
  - webview-ui/src/lib/vscode.ts
depends_on:
  - SDD-111-BUGFIX
agent_skills: frontend
created: 2026-10-16
---

## Context
SDD-111 added user-defined model lists per provider, stored under `ai.models` in `.sdd/config.json`. A non-empty list replaces the built-in list for that provider, and `getModelsForProvider()` in `src/config/aiConfig.ts` applies that rule. The UI only shows a hint telling the builder to edit `config.json` by hand. This spec lets the builder edit, save and immediately use their model lists from the AI Configuration webview.

Facts about the current implementation that this spec relies on:
- `AiConfigPanel` (`src/views/webviews/aiConfig/AiConfigPanel.ts`) answers `requestConfig` with `configData { config, tags, skills, models }`, where `models` holds the lists already resolved for each provider.
- `AiConfig.svelte` keeps `models` in `$state`. The execution and requirements model dropdowns use `withSaved(models[provider], current)`, so a saved model is never dropped.
- The execution form (`save()` → `saveConfig`) and the requirements form (`saveRequirementsConfig()`) save separately. Both use the same per-provider model lists.
- `writeAIConfig()` keeps the on-disk `ai.models` only when the payload has no `models`. The webview's `config` object (from `readAIConfig()`) **does** include `models`, so saving the execution form after editing models elsewhere would write the old list back. This spec must remove that risk.

## Requirements
### Functional
**Persistence (`src/config/aiConfig.ts`, `src/config/aiConfigTypes.ts`)**
- Export `MODEL_ID_PATTERN = /^[A-Za-z0-9._:@\/\[\]-]{1,100}$/` from `aiConfigTypes.ts`. It accepts ids such as `opus[1m]`, `claude-opus-5-5` and `gpt-5.5`, and rejects spaces and quotes.
- Add `writeAIModels(models: Record<string, string[]>): Promise<void>` to `aiConfig.ts`:
  - Reads `.sdd/config.json`, replaces only `ai.models`, and keeps every other key in `ai` and in the file unchanged.
  - For each provider: trims entries, drops empty ones, removes duplicates while keeping the first occurrence's order, and rejects the whole call with an `Error` naming the provider and value if any entry fails `MODEL_ID_PATTERN`.
  - A provider whose list ends up empty is removed from `ai.models`, which means it uses the built-in list again. If no providers remain, the `ai.models` key is deleted.
- Change `writeAIConfig()` so it **always** ignores any `models` field in its payload and keeps the on-disk `ai.models`. After this spec, `writeAIModels()` is the only writer of `ai.models`.

**Panel (`AiConfigPanel.ts`)**
- Extend `configData` with `customModels: Record<string, string[]>` (the sanitized user lists, `{}` when none) and `builtinModels: Record<string, string[]>` (`BUILTIN_MODELS`), keeping the existing resolved `models`.
- Handle the new message `saveModels { models: Record<string, string[]> }`:
  - Call `writeAIModels`, re-read the config, and post `modelsSaved { models, customModels }`, where `models` is the newly resolved lists. Show the notification `Model lists saved.`.
  - On a validation or write error, post `modelsSaveError { message }` and show an error notification. Nothing is written.

**UI (`AiConfig.svelte`)**
- Add a new section group **"Model Lists"** after the Requirements AI Config group, with one card per built-in provider (`claude`, `copilot`), shared by both forms.
- Each card shows a mode badge: `Built-in` when the provider has no custom list, `Custom` otherwise.
  - **Built-in mode:** show the built-in models as read-only chips and a `Customize` button that switches to custom mode, starting with a copy of the built-in list.
  - **Custom mode:**
    - Editable chips, each with a remove (×) button and move up/down controls (the first entry is the default chosen when switching provider).
    - An input with an `Add` button; Enter also adds.
    - A `Reset to built-in` button that empties the custom list (and so returns to built-in mode on save).
- Inline validation on add: entries that fail `MODEL_ID_PATTERN` (mirror the regex in the webview) or duplicate an existing entry show an inline error and are not added.
- A single `Save model lists` button for the whole group, plus an "Unsaved changes" indicator while edits differ from the last saved state. The button is disabled when nothing changed.
- On `modelsSaved`:
  - Replace `models` and the custom-list state with the received values, so the execution and requirements model dropdowns refresh immediately without reopening the panel.
  - The currently selected models are not changed. If a selected model is no longer in its provider's list, show the inline warning `"<model>" is not in the <provider> list; it will still be used.` under that dropdown (`withSaved` keeps it selectable).
- On `modelsSaveError`, show the message inline in the Model Lists group and keep the unsaved edits.
- Replace the SDD-111 hint under each model dropdown with `Manage models in Model Lists below.`

### Non-Functional
- Uses only VS Code theme variables, readable in light, dark and high-contrast themes, and all controls are keyboard reachable (chips' remove and move buttons have `aria-label`s).
- Saving the execution or requirements form never changes `ai.models`, and saving model lists never changes any other setting.

## Acceptance Criteria
### Automated
- [x] `src/config/aiConfig.test.ts` covers `writeAIModels`: writes a list, keeps other `ai` keys and top-level keys, trims and de-duplicates, removes empty providers, deletes `ai.models` when all are empty, and rejects an invalid id without writing anything.
- [x] `src/config/aiConfig.test.ts` covers `writeAIConfig` ignoring a payload `models` that differs from disk (disk value kept).
- [x] `src/config/aiConfigTypes.test.ts` covers `MODEL_ID_PATTERN` with valid ids (`fable`, `opus[1m]`, `claude-opus-5-5`, `gpt-5.5`, `org/model:tag`) and invalid ones (empty, with a space, with a quote, 101 characters).
- [x] `npm run build:webview` succeeds.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] Open AI Configuration, click `Customize` on Claude, add `claude-opus-5-5`, remove `haiku`, and save. `.sdd/config.json` contains `ai.models.claude` with the edited list, and the execution and requirements model dropdowns show the new list without reopening the panel.
- [x] Reopen the panel: the Claude card shows `Custom` with the saved list.
- [x] Click `Reset to built-in` and save: `ai.models.claude` is removed from `config.json`, and the dropdowns show the built-in list again.
- [x] Edit model lists and save, then change the pre-prompt and save the execution form: `ai.models` is unchanged.
- [x] Adding `my model` (with a space) shows an inline error and is not added.

## Examples
Resulting `.sdd/config.json` fragment after customizing Claude only:
```json
"ai": {
  "provider": "claude",
  "model": "fable",
  "models": {
    "claude": ["fable", "opus", "sonnet", "claude-opus-5-5"]
  }
}
```

## Constraints
- Do not change how models are passed to the CLI.
- Do not add model lists for custom providers here; SDD-103 builds the provider-driven UI on top of this editor.
- Do not convert the execution and requirements model `<select>` fields into free-text inputs; SDD-103 does that.
- Do not add new dependencies.

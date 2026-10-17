---
spec_id: SDD-104-NEW
title: Create, edit and delete custom providers from the AI Config UI
status: done
priority: medium
complexity: high
tags:
  - feature
  - phase-5
  - ui
  - rel-v2.0
relevant_files:
  - src/views/webviews/aiConfig/AiConfigPanel.ts
  - webview-ui/src/aiConfig/AiConfig.svelte
  - webview-ui/src/aiConfig/ProviderEditor.svelte
  - webview-ui/src/lib/types.ts
must_not_touch:
  - src/extension.ts
  - src/config/providerTypes.ts
  - src/config/aiConfig.ts
  - src/execution/providerCommand.ts
  - webview-ui/src/lib/vscode.ts
depends_on:
  - SDD-094-NEW
agent_skills: frontend
created: 2026-10-17
---



## Context
After SDD-091 to SDD-094, custom providers work end to end, but the builder still has to write `ai.customProviders` by hand in `.sdd/config.json`. Hand-written JSON is easy to get wrong: a missing `{prompt}`, a mode that points at a missing invocation, or a typo in the binary only shows up as a `console.warn` or a failed run. This spec adds a guided editor to the AI Configuration webview, so every provider is created in the same way and checked before it is saved.

Facts this spec relies on:
- `validateProviderDefinition()` and `validateProviderList()` (SDD-091) return `{ path, message }[]` and are the only validation rules. The webview must not reimplement them; it asks the panel.
- `writeCustomProviders()` (SDD-092) validates again, rejects removing a provider still referenced by `ai.provider` or `requirementsAi.provider`, and owns `ai.customProviders`. `writeAIConfig()` never touches that key.
- `buildProviderCommand()` and `formatFileRef()` (SDD-093) produce the exact command a run would use.
- `isCommandAvailable()` in `src/utils/shell.ts` (SDD-080) checks whether a binary is on the PATH.
- The "Model Lists" section (SDD-103) and the provider dropdowns (SDD-094) read the provider list from one `$state` in `AiConfig.svelte`.

## Requirements
### Functional
**Panel (`AiConfigPanel.ts`)**
- `configData` also carries `customProviders`: the raw definitions from `ai.customProviders` (not the model-resolved ones), so the editor edits exactly what is stored.
- `validateProvider { definition, index, all }` → `providerValidation { index, errors, previews, binaryFound }`:
  - `errors` = `validateProviderList(all)` filtered to the entries for `index`, with the index prefix removed.
  - When `errors` is empty, `previews` holds one `{ modeId, label, command }` per permission mode, built with `buildProviderCommand(definition, { permissionModeId, prompt, model, platform: process.platform })`. `prompt` is `Read and follow all instructions in ${formatFileRef(definition, '.sdd/executions/SDD-000/prompt.md')}.` and `model` is the first entry of `models`, if any.
  - `binaryFound` = `await isCommandAvailable(definition.binary)` (cached per binary for the panel's lifetime).
- `saveProviders { providers }` → calls `writeCustomProviders(providers)`. On success it re-reads the config and posts `providersSaved { customProviders, providers }`, where `providers` is the same resolved list `configData` sends (SDD-094), and shows `Custom providers saved.`. On failure it posts `providersSaveError { message }` and shows an error notification.

**Editor (`ProviderEditor.svelte`, used by `AiConfig.svelte`)**
- Add a "Custom Providers" section below "Model Lists". It lists each custom provider (label, id, binary, a badge `overrides built-in` when the id is `claude` or `copilot`) with Edit and Delete buttons, and an "Add provider" button.
- "Add provider" asks for a starting point: Blank, or a copy of a built-in (Claude or Copilot). A copy gets the id `<builtin>-custom` (with a numeric suffix if taken) and the label `<label> (custom)`.
- The edit form has one field per definition property:
  - `id` (read-only after the first save, since specs and settings may reference it), `label`, `binary`, `fileRefFormat`.
  - Batch and Interactive invocations, each with an enable checkbox and an argument list editor: one text input per argument, with add, remove, move up and move down. Buttons insert `{prompt}` or `{model}` at the cursor. Arguments are never split on spaces.
  - `modelArgs` with the same argument list editor.
  - Permission modes as rows of id, label, a Batch/Interactive select and an `extraArgs` list editor, with add and remove.
  - Suggested models as a list of text inputs (same input rules as "Model Lists").
- Live feedback: on every change, after 300 ms of inactivity, the editor sends `validateProvider` and:
  - shows each error under the field its `path` points at, and errors without a matching field at the top of the form;
  - shows a "Command preview" block with one line per permission mode when there are no errors;
  - shows a warning (not an error) `"<binary>" was not found on PATH` when `binaryFound` is false.
- "Save providers" is disabled while any provider has errors, while a validation is in flight, or when nothing changed. It sends the full list with `saveProviders`. The Cancel button discards the draft.
- Delete needs a second click on a "Confirm delete" button that appears in place. Deleting the provider currently selected in the execution form or the requirements form is blocked in the UI with the message `In use by <setting>; select another provider first.`
- On `providersSaved`, replace the provider list `$state` so the provider dropdowns and "Model Lists" cards update without reopening the panel. Unsaved changes in the execution form are kept.
- On `providersSaveError`, keep the draft and show the message at the top of the section.

### Non-Functional
- With no custom providers, the section shows only the "Add provider" button and a one-line explanation; the rest of the form is unchanged.
- The editor uses the same VS Code theme variables and button styles as the "Model Lists" section.

## Acceptance Criteria
### Automated
- [x] `src/views/webviews/aiConfig/AiConfigPanel.test.ts` (create if missing) covers: `configData` includes raw `customProviders`; `validateProvider` returns field errors for an invalid definition and previews for a valid one; `saveProviders` success posts `providersSaved` with the refreshed provider list; a rejected save posts `providersSaveError` and leaves the file unchanged.
- [x] `npm run build:webview` succeeds.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Adding a provider from "Copy of Claude", renaming it and saving writes a valid entry under `ai.customProviders`; it appears at once in the provider dropdown and in "Model Lists".
- [ ] Removing `{prompt}` from the batch args shows an error under that argument list and disables Save.
- [ ] The command preview matches the command shown in the terminal when a spec runs with that provider and mode.
- [ ] Deleting the provider selected in the execution form is blocked with the "In use by" message.
- [ ] Saving the execution form after saving providers keeps `ai.customProviders` intact.

## Constraints
- Do not add or change validation rules here; change SDD-091's `validateProviderDefinition()` instead.
- Do not edit or delete the built-in providers; they can only be copied or overridden by a custom provider with the same id.
- Do not change the requirements AI section of the form, apart from reading the provider list.

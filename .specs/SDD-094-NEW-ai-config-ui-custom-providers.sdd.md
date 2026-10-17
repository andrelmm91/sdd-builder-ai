---
spec_id: SDD-094-NEW
title: List custom providers and their modes in the AI Config webview
status: done
priority: low
complexity: medium
tags:
  - feature
  - phase-5
  - ui
  - rel-v2.0
relevant_files:
  - src/views/webviews/aiConfig/AiConfigPanel.ts
  - webview-ui/src/aiConfig/AiConfig.svelte
  - webview-ui/src/lib/types.ts
must_not_touch:
  - src/extension.ts
  - src/config/providerTypes.ts
  - webview-ui/src/lib/vscode.ts
depends_on:
  - SDD-093-TECHDEBT
  - SDD-103-NEW
agent_skills: frontend
created: 2026-10-15
---

## Context
The AI Config webview (`AiConfig.svelte`) hard-codes the provider dropdown (Claude and Copilot) and derives permission modes and models from constants in `aiConfigTypes.ts`. After SDD-092 and SDD-093, providers come from `getAvailableProviders()`, so the UI must render them dynamically.

`AiConfigPanel` currently answers `requestConfig` with `configData { config, tags, skills }`.

## Requirements
### Functional
- `AiConfigPanel` adds `providers` to `configData`: `{ id, label, models, permissionModes: { id, label, mode }[] }[]`.
- `AiConfig.svelte` builds the provider dropdown, permission-mode dropdown and model list from `providers`, replacing the separate `models` map introduced in SDD-102. Each provider's `models` is already resolved with the user's `ai.models` precedence. The model input becomes a text field with a datalist of suggestions, so any model id can be typed.
- Extend the "Model Lists" editor from SDD-103 so it shows one card per available provider, including custom providers, instead of only `claude` and `copilot`. For custom providers, "built-in" means the `models` from their definition. Saving still goes through `saveModels` / `writeAIModels`.
- Changing the provider resets the permission mode to that provider's first mode and the model to its first suggested model, or empty when it has none (preserving today's behavior).
- Show a small read-only note under the provider dropdown: `Add or edit custom providers in the "Custom Providers" section below.` (that section is added by SDD-104).
- Saving does not drop `customProviders`; `writeAIConfig()` keeps the on-disk list (SDD-092).

### Non-Functional
- With no custom providers, the form looks and behaves exactly as today.

## Acceptance Criteria
### Automated
- [x] `npm run build:webview` succeeds.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Adding a custom provider to `.sdd/config.json` and reopening AI Config shows it in the dropdown with its modes, and saving keeps the `customProviders` block intact.

## Constraints
- Do not build the editor for custom provider definitions here; that is SDD-104. Keep the provider list in a single `$state` that SDD-104 can refresh after a save.
- Do not change the requirements AI section of the form.

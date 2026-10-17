---
spec_id: SDD-092-NEW
title: Load custom provider definitions from project config
status: review
priority: medium
complexity: low
tags:
  - feature
  - phase-5
  - backend
  - rel-v2.0
relevant_files:
  - src/config/aiConfig.ts
  - src/config/aiConfigTypes.ts
  - src/config/providerTypes.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
depends_on:
  - SDD-091-NEW
agent_skills: backend
created: 2026-10-15
---

## Context
With `ProviderDefinition` from SDD-091, builders can declare their own agent CLIs. AI settings live under the `ai` key in `.sdd/config.json` (`readAIConfig` and `writeAIConfig` in `src/config/aiConfig.ts`). This spec adds a `customProviders` array there and exposes the merged provider list.

## Requirements
### Functional
- Add an optional `customProviders?: ProviderDefinition[]` to `AIConfig`.
- `readAIConfig()` reads `ai.customProviders`, keeps only entries for which `validateProviderDefinition` returns no errors, and logs invalid entries with `console.warn` along with their errors.
- `ai.customProviders` is owned by a new `writeCustomProviders()`. Like `ai.models` (SDD-103), `writeAIConfig()` ignores any `customProviders` in its payload and always keeps what is on disk, so saving the execution form can never write a stale provider list back.
- Export `writeCustomProviders(defs: ProviderDefinition[]): Promise<void>`, which replaces only `ai.customProviders`:
  - Runs `validateProviderList(defs)` and throws an error listing every `path: message` when any error is found. Nothing is written on failure.
  - Trims string fields, drops empty optional arrays (`models`, `modelArgs`, `extraArgs`), and removes the key when the list is empty.
  - Throws when a provider id that the current file references in `ai.provider` or `requirementsAi.provider` would disappear (it is neither in `defs` nor a built-in), naming the referencing setting.
  - When a provider is removed, also removes its entry from `ai.models`.
- Export `getAvailableProviders(aiConfig?: AIConfig): ProviderDefinition[]`, returning the built-ins merged with valid custom providers (custom overrides by `id`). Each returned definition's `models` is set to `resolveProviderModels(def, aiConfig.models)`, so the precedence is `ai.models[id]`, then the custom provider's `models`, then the built-in list.
- Reimplement `getModelsForProvider` (from SDD-102) on top of `getAvailableProviders`, so a custom provider's models also appear in the AI Config form.
- When `ai.provider` refers to an unknown id, `readAIConfig()` falls back to `claude` and logs a warning.

### Non-Functional
- Projects without `customProviders` behave exactly as before.

## Acceptance Criteria
### Automated
- [x] `src/config/aiConfig.test.ts` covers: no custom providers, a valid custom provider, `ai.models` overriding a custom provider's `models`, an invalid one filtered out, a custom override of `claude`, an unknown provider id falling back, `writeAIConfig` keeping on-disk `customProviders` even when the payload carries a different list, and `writeCustomProviders` for: a valid save, a rejected invalid list (file unchanged), a rejected duplicate id, a rejected removal of the provider used by `ai.provider` or `requirementsAi.provider`, removal pruning `ai.models[id]`, and an empty list deleting the key.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] None.

## Examples
```json
"ai": {
  "provider": "codex",
  "customProviders": [
    {
      "id": "codex",
      "label": "OpenAI Codex CLI",
      "binary": "codex",
      "fileRefFormat": "{path}",
      "batch": { "args": ["exec", "{prompt}"] },
      "interactive": { "args": ["{prompt}"] },
      "permissionModes": [
        { "id": "auto", "label": "Full auto", "mode": "batch", "extraArgs": ["--full-auto"] },
        { "id": "default", "label": "Ask", "mode": "interactive" }
      ]
    }
  ]
}
```
This example is illustrative. The exact Codex flags must be verified by the builder.

## Constraints
- Do not use providers for command building yet (SDD-093).

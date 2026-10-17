---
spec_id: SDD-092-NEW
title: Load custom provider definitions from project config
status: ready
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
- `writeAIConfig()` preserves `customProviders` when saving.
- Export `getAvailableProviders(aiConfig?: AIConfig): ProviderDefinition[]`, returning the built-ins merged with valid custom providers (custom overrides by `id`). Each returned definition's `models` is set to `resolveProviderModels(def, aiConfig.models)`, so the precedence is `ai.models[id]`, then the custom provider's `models`, then the built-in list.
- Reimplement `getModelsForProvider` (from SDD-102) on top of `getAvailableProviders`, so a custom provider's models also appear in the AI Config form.
- When `ai.provider` refers to an unknown id, `readAIConfig()` falls back to `claude` and logs a warning.

### Non-Functional
- Projects without `customProviders` behave exactly as before.

## Acceptance Criteria
### Automated
- [ ] `src/config/aiConfig.test.ts` covers: no custom providers, a valid custom provider, `ai.models` overriding a custom provider's `models`, an invalid one filtered out, a custom override of `claude`, an unknown provider id falling back, and `writeAIConfig` round-tripping `customProviders`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

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

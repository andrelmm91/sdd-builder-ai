---
spec_id: SDD-100-NEW
title: Allow per-spec provider, model and timeout overrides
status: draft
priority: medium
complexity: medium
tags: [feature, phase-5, backend, rel-v2.0]
relevant_files:
  - src/specs/types.ts
  - src/specs/parser.ts
  - src/specs/validator.ts
  - src/commands/executeSpec.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
depends_on: [SDD-089-NEW, SDD-098-TECHDEBT, SDD-101-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
Every spec runs with the same global provider, model and 10-minute timeout. Simple specs could run on a cheaper or faster model, and hard ones need a stronger model and more time. Optional frontmatter overrides let spec authors, or the planner, tune each spec.

## Requirements
### Functional
- Add optional fields to `SpecData` (`src/specs/types.ts`) and parse them in `parseSpec()` (`src/specs/parser.ts`):
  - `provider?: string`
  - `model?: string`
  - `timeout_minutes?: number`
- Validator schema (`src/specs/validator.ts`): `provider` is a non-empty string, `model` is a non-empty string, `timeout_minutes` is an integer from 1 to 120. None are required. Add a warning when `provider` is not a known provider id (use `getAvailableProviders()` when a config is available; otherwise skip the check).
- In `executeSingleSpec()`, build the effective AI config as the global `aiConfig` overridden by the spec's `provider`/`model`. When the spec overrides `provider` but not `model`, use the provider's first suggested model, or none.
- Effective timeout: `timeout_minutes * 60_000` when set, otherwise the complexity-based timeout from SDD-101, passed as `ExecutionConfig.timeoutMs`.
- The progress notification title shows overrides, for example `Executing SDD-042 (opus)`.

### Non-Functional
- Specs without overrides behave exactly as before.

## Acceptance Criteria
### Automated
- [ ] Parser and validator tests cover each new field (valid, invalid and absent).
- [ ] `src/commands/executeSpec.test.ts` covers: a model override, a provider override with the default model, a timeout override, and no overrides.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] A spec with `model: haiku` launches the CLI with `--model haiku` while the global setting is `sonnet`.

## Constraints
- Do not add these fields to the spec form webview in this spec.
- Do not change permission mode per spec; it stays global for safety.

---
spec_id: SDD-100-TECHDEBT
title: Timeout multiplier in AI Configuration UI and remove stray scripts
status: review
priority: low
complexity: low
tags:
  - techdebt
  - phase-6
  - infra
  - rel-v2.0
relevant_files:
  - webview-ui/src/aiConfig/AiConfig.svelte
  - test-parse.mjs
  - test-validate.mjs
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - package.json
depends_on:
  - SDD-096-NEW
agent_skills: infra
created: 2026-10-15
---

## Context
SDD settings live in `.sdd/config.json` and are edited through the AI Configuration panel, never through the VS Code Settings UI. SDD-096 reads `ai.timeoutMultiplier` from `.sdd/config.json`, but there is no field for it in the panel yet. Separately, `test-parse.mjs` and `test-validate.mjs` at the repository root are leftover ad-hoc scripts, not part of the Vitest suite or the build.

## Requirements
### Functional
- In `AiConfig.svelte`, add a number input "Execution timeout multiplier" (min `0.25`, max `10`, step `0.25`, default `1`) to the execution AI config form. Load it from `configData.config.timeoutMultiplier` and include it in the `saveConfig` payload (add it to the `AIConfig` interface, state, `configData` handler and `save()` payload). Hint text: `Multiplies the complexity-based timeout (low 10 min, medium 20 min, high 40 min).`
- Delete `test-parse.mjs` and `test-validate.mjs` after confirming with `grep` that nothing in `package.json`, `src/`, `test/` or the CI workflow references them.

### Non-Functional
- Do not add anything to `package.json` `contributes.configuration` and do not read `vscode.workspace.getConfiguration` for this setting.

## Acceptance Criteria
### Automated
- [x] `npm test`, `npm run type-check`, `npm run lint` and `npm run build:all` pass.

### Manual
- [x] The timeout multiplier field appears in the AI Configuration panel, and saving writes `ai.timeoutMultiplier` to `.sdd/config.json`.

## Constraints
- Do not change existing settings.
- Do not delete any other files.

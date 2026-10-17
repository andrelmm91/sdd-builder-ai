---
spec_id: SDD-100-TECHDEBT
title: Declare new settings in package.json and remove stray scripts
status: draft
priority: low
complexity: low
tags: [techdebt, phase-6, infra, rel-v2.0]
relevant_files:
  - package.json
  - test-parse.mjs
  - test-validate.mjs
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-090-NEW, SDD-096-NEW]
agent_skills: infra
created: 2026-10-15
---

## Context
SDD-090 reads `sdd.inlineRelevantFiles` and SDD-096 reads `sdd.timeoutMultiplier` with defaults, but neither is declared in `package.json` `contributes.configuration`, so they don't appear in the VS Code Settings UI. Separately, `test-parse.mjs` and `test-validate.mjs` at the repository root are leftover ad-hoc scripts, not part of the Vitest suite or the build.

## Requirements
### Functional
- In `package.json` `contributes.configuration.properties`, add:
  - `sdd.inlineRelevantFiles`: boolean, default `false`, description `Inline the contents of relevant_files into the execution prompt instead of listing paths.`
  - `sdd.timeoutMultiplier`: number, default `1`, minimum `0.25`, maximum `10`, description `Multiplier applied to the complexity-based execution timeout (low 10 min, medium 20 min, high 40 min).`
- Delete `test-parse.mjs` and `test-validate.mjs` after confirming with `grep` that nothing in `package.json`, `src/`, `test/` or the CI workflow references them.

### Non-Functional
- No runtime code changes.

## Acceptance Criteria
### Automated
- [ ] A test (or an addition to an existing package.json test) asserts both settings are declared with the right types and defaults.
- [ ] `npm test`, `npm run type-check`, `npm run lint` and `npm run build:all` pass.

### Manual
- [ ] Both settings appear under "SDD" in the VS Code Settings UI.

## Constraints
- Do not change existing settings.
- Do not delete any other files.

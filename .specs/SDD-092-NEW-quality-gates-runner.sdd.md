---
spec_id: SDD-092-NEW
title: Add configurable quality gates and a gate runner
status: draft
priority: high
complexity: medium
tags: [feature, phase-4, backend, rel-v2.0]
relevant_files:
  - src/execution/qualityGates.ts
  - src/config/projectConfig.ts
  - src/execution/postValidation.ts
  - src/execution/types.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-080-BUGFIX]
agent_skills: backend
created: 2026-10-15
---

## Context
After execution, SDD can optionally run one test command (`runPostValidation` in `src/execution/postValidation.ts`), but the result is only stored as `testsPassed`. Projects usually need several checks (tests, type check, lint, build). This spec introduces named quality gates in `.sdd/config.json` and a runner that executes them in order. SDD-094 wires the runner into execution.

## Requirements
### Functional
- Extend `ProjectConfig` in `src/config/projectConfig.ts` with an optional `gates?: { name: string; command: string; required?: boolean }[]`. `required` defaults to `true`.
- When `gates` is absent or empty and `testCommand` is set, `readProjectConfig()` exposes a single derived gate `{ name: 'tests', command: testCommand, required: true }`.
- Add these types to `src/execution/types.ts`:
  - `GateResult = { name: string; command: string; passed: boolean; required: boolean; output: string; duration: number }`
  - `GateRunSummary = { passed: boolean; results: GateResult[] }`. `passed` is true when every required gate passed.
- Create `src/execution/qualityGates.ts` exporting `runGates(gates, cwd, options?: { stopOnRequiredFailure?: boolean; extraCommands?: string[] }): Promise<GateRunSummary>`:
  - Runs gates sequentially through the logic in `runPostValidation` (refactor it into a reusable `runCommandCheck(command, cwd)` in `postValidation.ts` and keep `runPostValidation` as a thin wrapper).
  - `extraCommands` run after configured gates as required gates named `verify-1`, `verify-2`, and so on (used by SDD-093).
  - Each gate's `output` is truncated to its last 8 KB.
  - With `stopOnRequiredFailure` (default `false`), the runner stops after the first failed required gate.

### Non-Functional
- Backwards compatible: projects with only `testCommand` behave exactly as before.

## Acceptance Criteria
### Automated
- [ ] `src/execution/qualityGates.test.ts` covers: all pass, a required gate failing, an optional gate failing (summary still passes), `stopOnRequiredFailure`, `extraCommands`, and output truncation.
- [ ] A projectConfig test covers the derived `tests` gate.
- [ ] Existing `postValidation.test.ts` tests still pass.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

## Constraints
- Do not change `executeSpec.ts` (SDD-094).
- Do not add a UI for editing gates in this spec.

---
spec_id: SDD-094-NEW
title: Run quality gates after execution and record results
status: draft
priority: high
complexity: medium
tags: [feature, phase-4, backend, rel-v2.0]
relevant_files:
  - src/commands/executeSpec.ts
  - src/execution/types.ts
  - src/execution/qualityGates.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/resultCapture.ts
depends_on: [SDD-092-NEW, SDD-093-NEW, SDD-084-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
`executeSingleSpec()` currently calls `runPostValidation()` only when `autoValidate` and `testCommand` are set, stores `testsPassed`, and always moves the spec to `review`, even when tests fail. This spec replaces that with the gate runner from SDD-092 plus the spec's own `verify` commands from SDD-093, and stores the full results so the builder sees them on the review card (SDD-096).

## Requirements
### Functional
- On both the interactive and non-interactive success paths, replace the `runPostValidation` call with `runGates(projectGates, root, { extraCommands: spec.frontmatter.verify })`, still guarded by `getAutoValidate()`.
- Add an optional `gates?: GateRunSummary` field to `ExecutionRecord` and patch it into the record through the existing `patchExecutionRecord` helper. Keep writing `testsPassed`: set it to `summary.passed` for backwards compatibility.
- The spec still moves to `review` whatever the gate result. The completion notification changes to:
  - all pass: `<specId> complete: all checks passed. Ready for review.`
  - any required failure: a warning `<specId> complete, but N check(s) failed: <names>. Review carefully.`
- Remove the now-unused `runPostValidation` import from `executeSpec.ts` if nothing else uses it.

### Non-Functional
- When no gates are configured and the spec has no `verify` commands, behavior and notifications match today.

## Acceptance Criteria
### Automated
- [ ] `src/commands/executeSpec.test.ts` covers: gates pass (info message), a required gate fails (warning message, status still `review`), `autoValidate` false (gates not run), and spec `verify` commands passed as `extraCommands`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Executing a spec that breaks a test shows the failed-checks warning and records the failure in `exec-NNN.json`.

## Constraints
- Do not implement retries here (SDD-095).
- Do not change `cliRunner.ts`.

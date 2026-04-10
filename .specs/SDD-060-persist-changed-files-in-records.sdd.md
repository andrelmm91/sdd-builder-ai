---
spec_id: SDD-060
title: Persist changed files array in execution records
status: done
priority: medium
complexity: low
tags: [phase-2, refactor, backend]
relevant_files:
  - src/execution/types.ts
  - src/execution/resultCapture.ts
  - src/execution/resultCapture.test.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: []
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The `captureResults` function in `resultCapture.ts` already detects changed files via `git diff --name-only` and returns them in `CaptureResult.changedFiles`. However, the `ExecutionRecord` type (written to `exec-*.json`) does not include `changedFiles`, so the data is lost after capture.

This spec adds a `changedFiles` field to `ExecutionRecord` so the changed files list is persisted in the JSON record and can be read later by the kanban UI (SDD-061).

## Requirements
### Functional
- Add `changedFiles?: string[]` field to the `ExecutionRecord` interface in `types.ts`
- In `captureResults()`, include the `changedFiles` array in the `ExecutionRecord` object that gets written to `exec-*.json`
- The field should include file paths with change type indicators (e.g., `M src/foo.ts`, `A src/bar.ts`, `D src/old.ts`) as returned by `git diff --name-status`
- Update the git diff command from `git diff --name-only` to `git diff --name-status` to capture the change type (added/modified/deleted)

### Non-Functional
- Backward compatible: existing execution records without `changedFiles` must still load correctly (field is optional)

## Acceptance Criteria
### Automated
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Unit test: `captureResults` writes `changedFiles` to the execution record JSON
- [ ] Existing resultCapture tests pass

### Manual
- [ ] After executing a spec, the `exec-*.json` file contains a `changedFiles` array with status-prefixed file paths

## Constraints
- Only modify `src/execution/types.ts`, `src/execution/resultCapture.ts`, and `src/execution/resultCapture.test.ts`
- Do not change `CaptureResult` type — it already has `changedFiles`
- Do not modify the execution flow or CLI runner

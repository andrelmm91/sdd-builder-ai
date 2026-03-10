---
spec_id: SDD-079
title: Fix spec card stuck in processing state when execution fails
status: draft
priority: high
complexity: low
tags: [phase-2, bugfix, backend]
relevant_files:
  - src/commands/executeSpec.ts
  - src/execution/bulkExecution.ts
must_not_touch:
  - src/execution/cliRunner.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: []
budget_max_tokens: 80000
agent_skills: backend-dev
created: 2026-03-10
---

## Context

In `executeSpec.ts`, `executeSingleSpec` transitions the spec to `in_progress` before running the CLI. If execution succeeds it transitions to `review`. On failure the `catch` block reverts to `ready`. However there is a scenario where an exception is thrown after the status was set to `in_progress` but before `executionResult` is set — if the revert itself throws, the spec stays in `in_progress` permanently and the kanban card stays in "processing" state with no way to recover without manually editing the file.

Additionally, `BulkExecutionManager.executeAll()` marks items as `failed` internally but does not ensure the spec file status is reverted. If the underlying `executeFn` throws without reverting, the spec file remains `in_progress`.

## Requirements

### Functional
- In `executeSingleSpec`, wrap the status-revert in a `try/catch` that shows an error message if the revert itself fails, ensuring the user always gets feedback.
- Add a `finally` block (or ensure the catch block always runs) so that if the spec is still `in_progress` after a failure, it is unconditionally reverted to `ready` and an error message is shown.
- In `BulkExecutionManager.executeAll()`, after a failed item, ensure the spec file status revert is attempted.
- The kanban `FileSystemWatcher` already triggers a `sendSpecs()` refresh on file change; the fix only needs to ensure the file is correctly written.

### Non-Functional
- No change to the happy-path execution flow
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes

### Manual
- [ ] When execution fails (e.g. CLI not found after preflight), the spec card reverts from "In Progress" to "Ready" in the kanban board
- [ ] An error message is shown explaining the failure
- [ ] No spec is permanently left in `in_progress` after a failure

## Constraints
- Surgical fix only — do not refactor the entire execution flow
- Do not change the `ExecutionRunner` interface

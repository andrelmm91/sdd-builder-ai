---
spec_id: SDD-084-NEW
title: Use the git checkpoint to capture accurate changed files per execution
status: done
priority: high
complexity: medium
tags:
  - feature:GitCheckpoint
  - phase-2
  - backend
  - rel-v2.0
relevant_files:
  - src/commands/executeSpec.ts
  - src/execution/resultCapture.ts
  - src/execution/types.ts
  - src/execution/gitCheckpoint.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on:
  - SDD-083-NEW
agent_skills: backend
created: 2026-10-15
---



## Context
SDD-083 introduced `createCheckpoint()` and `getChangesSince()` in `src/execution/gitCheckpoint.ts`. This spec uses them so every execution record lists exactly the files the AI changed, including new untracked files and changes it committed, and excluding the builder's pre-existing edits.

The checkpoint is also persisted in the execution record so the "Discard changes" feature (SDD-085/086) can restore the pre-execution state later, even after a window reload.

## Requirements
### Functional
- In `executeSingleSpec()` (`src/commands/executeSpec.ts`), call `createCheckpoint(root)` immediately before the status moves to `in_progress`, on both the interactive and non-interactive paths.
- Checkpoint reuse after Request Changes: before creating a checkpoint, load the spec's latest execution record with `getLatestExecution(specId)`. If it has `reuseCheckpointOnNextRun: true` and a `checkpoint`, reuse that checkpoint instead of creating a new one. The AI's kept changes are then not counted as part of the baseline, so `changedFiles` for the re-run is cumulative across attempts, and a later discard (SDD-086) reverts all of them.
- Add an optional `reuseCheckpointOnNextRun?: boolean` field to `ExecutionRecord`. Request Changes sets it in SDD-086. New records never copy it, so the reuse applies to one re-run, and a new Request Changes round sets it again on the new record.
- Change the signature to `captureResults(specId, executionResult, checkpoint?: GitCheckpoint)`. When a checkpoint is given, `changedFiles` comes from `getChangesSince(checkpoint, root)`. Without one, keep the current `git diff --name-status` fallback.
- Add an optional `checkpoint?: GitCheckpoint` field to `ExecutionRecord` in `src/execution/types.ts` and persist it in `exec-NNN.json`.
- Pass the checkpoint into every `captureResults` call in `executeSpec.ts`, including the cancelled and failed paths.
- If `createCheckpoint` returns `undefined` (not a git repo), execution continues and a one-time information message says change tracking and discard are unavailable outside a git repository.

### Non-Functional
- Existing execution records without `checkpoint` must keep loading (field is optional).

## Acceptance Criteria
### Automated
- [x] `src/execution/resultCapture.test.ts` covers: checkpoint provided (uses `getChangesSince`), checkpoint absent (fallback), and the checkpoint persisted in the written JSON.
- [x] `src/commands/executeSpec.test.ts` asserts `createCheckpoint` is called before the status changes to `in_progress`, and that its result is passed to `captureResults`.
- [x] `src/commands/executeSpec.test.ts` asserts that when the latest record has `reuseCheckpointOnNextRun: true` and a checkpoint, `createCheckpoint` is not called and that checkpoint is passed to `captureResults`. Without the flag, a new checkpoint is created.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] With an unrelated uncommitted edit in the workspace, execute a spec that creates a new file: the review card lists only the new file as `A`.
- [ ] With the commit command enabled, the review card still lists the files the AI committed.

## Constraints
- Do not change the Kanban UI.

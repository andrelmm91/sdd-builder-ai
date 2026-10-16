---
spec_id: SDD-084-NEW
title: Use the git checkpoint to capture accurate changed files per execution
status: draft
priority: high
complexity: medium
tags: [feature, phase-2, backend, rel-v2.0]
relevant_files:
  - src/commands/executeSpec.ts
  - src/execution/resultCapture.ts
  - src/execution/types.ts
  - src/execution/gitCheckpoint.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: [SDD-083-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
SDD-083 introduced `createCheckpoint()` and `getChangesSince()` in `src/execution/gitCheckpoint.ts`. This spec uses them so every execution record lists exactly the files the AI changed, including new untracked files and changes it committed, and excluding the builder's pre-existing edits.

The checkpoint is also persisted in the execution record so the "Discard changes" feature (SDD-085/071) can restore the pre-execution state later, even after a window reload.

## Requirements
### Functional
- In `executeSingleSpec()` (`src/commands/executeSpec.ts`), call `createCheckpoint(root)` immediately before the status moves to `in_progress`, on both the interactive and non-interactive paths.
- Change the signature to `captureResults(specId, executionResult, checkpoint?: GitCheckpoint)`. When a checkpoint is given, `changedFiles` comes from `getChangesSince(checkpoint, root)`. Without one, keep the current `git diff --name-status` fallback.
- Add an optional `checkpoint?: GitCheckpoint` field to `ExecutionRecord` in `src/execution/types.ts` and persist it in `exec-NNN.json`.
- Pass the checkpoint into every `captureResults` call in `executeSpec.ts`, including the cancelled and failed paths.
- If `createCheckpoint` returns `undefined` (not a git repo), execution continues and a one-time information message says change tracking and discard are unavailable outside a git repository.

### Non-Functional
- Existing execution records without `checkpoint` must keep loading (field is optional).

## Acceptance Criteria
### Automated
- [ ] `src/execution/resultCapture.test.ts` covers: checkpoint provided (uses `getChangesSince`), checkpoint absent (fallback), and the checkpoint persisted in the written JSON.
- [ ] `src/commands/executeSpec.test.ts` asserts `createCheckpoint` is called before the status changes to `in_progress`, and that its result is passed to `captureResults`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] With an unrelated uncommitted edit in the workspace, execute a spec that creates a new file: the review card lists only the new file as `A`.
- [ ] With the commit command enabled, the review card still lists the files the AI committed.

## Constraints
- Do not change scope violation logic here (SDD-090).
- Do not change the Kanban UI.

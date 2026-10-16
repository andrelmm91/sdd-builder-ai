---
spec_id: SDD-086-NEW
title: Add Discard AI Changes command and discard on reject only
status: done
priority: high
complexity: medium
tags:
  - feature:GitCheckpoint
  - phase-2
  - backend
  - rel-v2.0
relevant_files:
  - src/commands/reviewCommands.ts
  - src/review/reviewManager.ts
  - src/extension.ts
  - package.json
  - src/execution/resultCapture.ts
must_not_touch:
  - src/commands/executeSpec.ts
  - src/execution/cliRunner.ts
depends_on:
  - SDD-084-NEW
  - SDD-085-NEW
agent_skills: backend
created: 2026-10-15
---



## Context
SDD-084 persists a `checkpoint` and `changedFiles` in each execution record, and SDD-085 provides `restoreCheckpoint()`. This spec exposes them to the builder as a command and uses them when a spec is rejected.

Discard happens **only on Reject**. Request Changes **keeps** the AI's changes so the next run builds on the existing work instead of regenerating it from scratch, which saves tokens. To keep Reject correct after one or more Request Changes rounds, the next run reuses the original checkpoint (see SDD-084, `reuseCheckpointOnNextRun`), so a later Reject discards the work from all attempts.

Today, `ReviewManager.submitDecision(specId, 'reject')` runs `git checkout HEAD -- <files>` on every uncommitted file. That also wipes the builder's unrelated edits and leaves new files the AI created. This spec replaces it with the checkpoint-based discard.

## Requirements
### Functional
- In `src/commands/reviewCommands.ts`, export `discardExecutionChanges(specId: string, options?: { confirm?: boolean }): Promise<boolean>`:
  - Loads the latest execution record with `getLatestExecution(specId)` from `src/execution/resultCapture.ts`.
  - If the record has no `checkpoint`, shows `No checkpoint available for <specId>; changes cannot be discarded automatically.` and returns `false`.
  - When `options.confirm` is not `false` (the default), shows a modal confirmation with the number of files to revert: `Discard N file change(s) made by the AI for <specId>? This cannot be undone.` Cancelling returns `false`.
  - Calls `restoreCheckpoint` and reports the result. If `headMoved` is true, it also warns: `The AI created commit(s) after the checkpoint. Files were restored, but the commits remain; use git to remove them if needed.`
  - Returns `true` when at least one file was restored or deleted.
- Add `createDiscardChangesCommand(refresh)` and register it as `sdd.discardChanges` (title `SDD: Discard AI Changes`) in `src/extension.ts` and `package.json`. Accept a `SpecTreeItem` or spec ID like the other review commands.
- Reject (`ReviewManager.submitDecision` with `'reject'` in `src/review/reviewManager.ts`):
  - Remove the existing `git checkout HEAD -- <files>` revert.
  - Replace the confirmation text with `Reject <specId> and discard N file change(s) made by the AI? This cannot be undone.` and keep a single `Reject & Discard` action. N comes from the latest execution record's `changedFiles`.
  - After confirmation, call `discardExecutionChanges(specId, { confirm: false })` so the builder confirms only once, then move the spec to `draft`.
  - If there is no checkpoint, the confirmation reads `Reject <specId>? No checkpoint is available, so the AI's changes will be kept.` with the action `Reject`, and no files are touched.
- Request Changes (`applyRequestChanges` and `createRequestChangesCommand`):
  - Never discard or revert files, and never prompt about discarding.
  - After the spec is updated, set `reuseCheckpointOnNextRun: true` on the latest execution record and write it back, so the next run in SDD-084 keeps the original checkpoint.

### Non-Functional
- A discard always requires one explicit confirmation, either from the standalone command or from the Reject dialog.
- Request Changes must never modify files outside the spec file and the execution record.

## Acceptance Criteria
### Automated
- [x] Tests for `discardExecutionChanges` cover: no record, no checkpoint, user cancels, `confirm: false` skipping the dialog, a successful restore, and the `headMoved` warning.
- [x] `src/review/reviewManager.test.ts` covers Reject: it calls the discard with `confirm: false` after the single confirmation, no longer runs `git checkout HEAD`, and does not discard when the user cancels. Without a checkpoint, it rejects without touching files.
- [x] A test asserts that `applyRequestChanges` never calls `restoreCheckpoint` and sets `reuseCheckpointOnNextRun: true` on the latest execution record.
- [x] A test asserts `sdd.discardChanges` is declared in `package.json` `contributes.commands`.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Rejecting a spec returns the workspace to its pre-execution state after a single confirmation, and an unrelated pre-existing edit is preserved.
- [ ] Request Changes keeps the AI's changes. After the re-run, Reject discards the changes from both runs.

## Constraints
- In `src/extension.ts`, only add the command registration and import.
- Do not change the approve flow.

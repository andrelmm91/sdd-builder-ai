---
spec_id: SDD-086-NEW
title: Add Discard AI Changes command and offer it on reject and request changes
status: draft
priority: high
complexity: medium
tags: [feature, phase-2, backend, rel-v2.0]
relevant_files:
  - src/commands/reviewCommands.ts
  - src/extension.ts
  - package.json
  - src/execution/resultCapture.ts
must_not_touch:
  - src/commands/executeSpec.ts
  - src/execution/cliRunner.ts
depends_on: [SDD-084-NEW, SDD-085-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
SDD-084 persists a `checkpoint` and `changedFiles` in each execution record, and SDD-085 provides `restoreCheckpoint()`. This spec exposes them to the builder as a command, and offers the discard at the moments it is most useful: when a spec is rejected or sent back with Request Changes.

## Requirements
### Functional
- In `src/commands/reviewCommands.ts`, export `discardExecutionChanges(specId: string): Promise<boolean>`:
  - Loads the latest execution record with `getLatestExecution(specId)` from `src/execution/resultCapture.ts`.
  - If the record has no `checkpoint`, shows `No checkpoint available for <specId>; changes cannot be discarded automatically.` and returns `false`.
  - Shows a modal confirmation listing the number of files to revert: `Discard N file change(s) made by the AI for <specId>? This cannot be undone.`
  - On confirm, calls `restoreCheckpoint` and reports the result. If `headMoved` is true, it also warns: `The AI created commit(s) after the checkpoint. Files were restored, but the commits remain; use git to remove them if needed.`
  - Returns `true` when at least one file was restored or deleted.
- Add `createDiscardChangesCommand(refresh)` and register it as `sdd.discardChanges` (title `SDD: Discard AI Changes`) in `src/extension.ts` and `package.json`. Accept a `SpecTreeItem` or spec ID like the other review commands.
- Request Changes and Reject: after the existing flow succeeds, show the non-modal prompt `Also discard the AI's changes for <specId>?` with `Discard` and `Keep`. `Discard` calls `discardExecutionChanges`.

### Non-Functional
- The discard must always require explicit confirmation.

## Acceptance Criteria
### Automated
- [ ] Tests for `discardExecutionChanges` cover: no record, no checkpoint, user cancels, a successful restore, and the `headMoved` warning.
- [ ] A test asserts `sdd.discardChanges` is declared in `package.json` `contributes.commands`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Rejecting a spec and choosing Discard returns the workspace to its pre-execution state.

## Constraints
- In `src/extension.ts`, only add the command registration and import.
- Do not change the approve flow.

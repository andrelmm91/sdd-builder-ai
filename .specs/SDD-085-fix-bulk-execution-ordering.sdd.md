---
spec_id: SDD-085
title: Fix bulk execution to run specs in numerical and alphabetical ID order
status: done
priority: medium
complexity: low
tags: [phase-2, bugfix, backend]
relevant_files:
  - src/execution/bulkExecution.ts
must_not_touch:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
depends_on: []
agent_skills: backend-dev
created: 2026-03-10
---

## Context

`BulkExecutionManager.executeAll()` runs items in the order they appear in `this.items` array. Items are added to the queue via `addSpec()` in the order the user clicks "Add to Bulk" in the kanban UI. The user expects specs to execute in ascending numerical order (SDD-001 before SDD-002, etc.) regardless of the order they were added to the queue.

## Requirements

### Functional
- In `BulkExecutionManager.executeAll()`, sort `this.items` by `specId` in ascending numerical order before the execution loop. The sort must parse the numeric portion of the spec ID (e.g., `001` from `SDD-001`) and compare as integers.
- The sort must handle spec IDs with different prefixes gracefully (sort by the numeric suffix only).
- The `BulkExecutionState` sent to the webview must reflect the sorted order so the UI displays specs in execution order.
- Add a helper function `sortSpecIds(items: BulkExecutionItem[]): BulkExecutionItem[]` or sort in-place within `executeAll`.

### Non-Functional
- No change to the `BulkExecutionManager` public API
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes
- [ ] Unit test: add a test verifying that `executeAll` runs specs in ascending numerical order when added in reverse order (e.g., SDD-003, SDD-001, SDD-002 executes as 001, 002, 003)

### Manual
- [ ] Add SDD-010, SDD-003, SDD-007 to bulk queue in that order — execution runs SDD-003 first, then SDD-007, then SDD-010

## Constraints
- Single file change: `src/execution/bulkExecution.ts` only (plus its test file)
- Do not change the public interface of `BulkExecutionManager`

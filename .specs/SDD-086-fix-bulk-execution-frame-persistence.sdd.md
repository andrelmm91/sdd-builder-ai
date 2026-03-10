---
spec_id: SDD-086
title: Fix bulk execution frame not clearing after specs transition to review
status: done
priority: medium
complexity: low
tags: [phase-2, bugfix, frontend, backend]
relevant_files:
  - src/execution/bulkExecution.ts
  - webview-ui/src/kanban/Kanban.svelte
  - src/views/webviews/kanban/KanbanPanel.ts
must_not_touch:
  - src/commands/executeSpec.ts
  - src/execution/types.ts
depends_on: [SDD-085]
budget_max_tokens: 80000
agent_skills: fullstack-dev
created: 2026-03-10
---

## Context

After bulk execution completes, `BulkExecutionManager.executeAll()` sets `isRunning = false` and `currentIndex = -1`, but `this.items` still contains all items with `completed`/`failed` statuses. The kanban board then shows a ghost "Bulk Queue" frame in the Ready column because the condition checks `bulkState.items.length > 0 && !bulkState.isRunning` — which is true even though all specs have moved to "review" status.

The user expects the bulk execution frame to disappear after all specs are processed successfully.

## Requirements

### Functional
- In `BulkExecutionManager.executeAll()`, after the execution loop finishes (after `this.isRunning = false`), remove all items that have `status === 'completed'` from `this.items`. Items with `status === 'failed'` may remain so the user can see what failed.
- Fire a state change event after clearing completed items so the kanban UI receives the updated state.
- In `Kanban.svelte`, update the bulk queue frame condition: only render the bulk-frame in the Ready column if `bulkState.items.some(i => i.status === 'queued')` (i.e., there are still items not yet run).
- In `Kanban.svelte`, update the bulk execution frame condition in the In Progress column: show the running frame only while `bulkState.isRunning === true`.
- Ensure the kanban column count badge is updated correctly to not double-count specs that have already left the ready state.

### Non-Functional
- TypeScript compilation passes
- No regression in the ability to queue new specs for bulk execution after a completed run

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes

### Manual
- [ ] After bulk execution completes and all specs move to "review", the Bulk Queue frame disappears from the Ready column
- [ ] If one spec fails, the queue frame shows only the failed item (not the completed ones)
- [ ] A new bulk queue can be started after the previous one completed

## Constraints
- Do not change the `BulkExecutionState` interface in `types.ts`
- The `clear()` method remains available for manual queue clearing
- Changes must be confined to `bulkExecution.ts`, `Kanban.svelte`, and optionally `KanbanPanel.ts`

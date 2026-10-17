---
spec_id: SDD-097-NEW
title: Run the bulk queue in the order added and flag dependency problems
status: done
priority: high
complexity: medium
tags:
  - feature
  - phase-6
  - frontend
  - rel-v2.0
relevant_files:
  - src/execution/bulkExecution.ts
  - src/execution/bulkExecution.test.ts
  - webview-ui/src/lib/bulkWarnings.ts
  - webview-ui/src/kanban/Kanban.svelte
  - test/bulkWarnings.test.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/execution/types.ts
depends_on: []
agent_skills: frontend
created: 2026-10-15
---

## Context
`BulkExecutionManager.executeAll()` (`src/execution/bulkExecution.ts`) sorts queued specs by the numeric part of their ID before running them, so the order the builder picked is lost. The builder owns the execution order: specs must run exactly in the order they were added to the bulk queue. The tool must not reorder or skip specs on its own.

The queue also gives no hint when that order is a problem. A queued spec may depend on a spec that is not `done` and not in the queue, or on a spec that is queued after it. Today the builder only finds out when the AI builds on code that does not exist yet.

The Kanban webview already receives every spec with its `status` and `depends_on` (`SpecCard` in `Kanban.svelte`), so the warnings can be computed in the webview without changing the extension-side messages.

## Requirements
### Functional
- Execution order
  - In `executeAll()`, remove the numeric sort. Items run in the order of `this.items`, which is the order of `addSpec()` calls.
  - Do not reorder, skip or block items because of dependencies. Stop-on-first-failure and cancel keep working as today.
- Warning helper: create `webview-ui/src/lib/bulkWarnings.ts` with a pure function
  `getBulkDependencyWarnings(queue: string[], specs: { spec_id: string; status: string; depends_on: string[] }[]): Record<string, string[]>`.
  It returns, for each queued spec id that has a problem, the list of warning messages. For each id in a queued spec's `depends_on`:
  - The dependency is queued later in the queue: `<depId> is queued after this spec`.
  - The dependency is queued earlier: no warning.
  - The dependency is not queued and its status is `done`: no warning.
  - The dependency is not queued and its status is not `done`: `<depId> is not done (<status>)`.
  - The dependency is not among `specs`: `<depId> not found`.
  Specs with no problems are not included in the result.
- Kanban UI (`Kanban.svelte`)
  - Compute the warnings with `$derived`, from `bulkState.items` (in order) and `specs`, so they update when a spec status changes or the queue changes.
  - In the Ready column bulk frame, each item with warnings shows a `!` badge before its id and gets a highlighted row (left border in `--vscode-editorWarning-foreground`). The badge's `title` lists every warning on its own line, followed by `Remove and re-add specs to change the order.`
  - Show the same `!` badge on items in the In Progress bulk frame while the run is in progress.
  - When at least one item has warnings, the Ready bulk frame header shows `! N with dependency warnings`.
  - Each bulk item shows its position in the queue (`1.`, `2.`, …) so the execution order is visible.
  - Warnings never disable `Execute All`.

### Non-Functional
- The warning helper has no Svelte or VS Code imports, so it can be unit tested.
- Badge and row colors use VS Code theme variables only.

## Acceptance Criteria
### Automated
- [x] `src/execution/bulkExecution.test.ts` covers: items added as SDD-3, SDD-1, SDD-2 run in that order (not numerically); stop-on-failure and cancel still work.
- [x] `test/bulkWarnings.test.ts` covers `getBulkDependencyWarnings`: no dependencies (empty result), dependency done and not queued (no warning), dependency queued earlier (no warning), dependency queued later (out-of-order warning), dependency in draft and not queued (not-done warning with status), missing dependency (not-found warning), and a spec with several problems (all messages returned).
- [x] `npm test`, `npm run type-check`, `npm run lint` and `npm run build:webview` pass.

### Manual
- [ ] Queue SDD-B (depends on SDD-A) and then SDD-A. Both rows show positions 1 and 2, SDD-B shows `!` with `SDD-A is queued after this spec`, and Execute All runs SDD-B first.
- [ ] Queue a spec whose dependency is in draft. It shows `!` with `<id> is not done (draft)`. Moving that dependency to done removes the warning without reloading the board.
- [ ] Queue specs without dependencies. No badges are shown and they run in the order added.

## Constraints
- Do not run specs in parallel.
- Do not change the `bulkState` message format or `BulkExecutionItem`.
- Reordering the queue by drag and drop is out of scope.

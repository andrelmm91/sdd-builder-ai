---
spec_id: SDD-102-NEW
title: Order and gate bulk execution by spec dependencies
status: draft
priority: high
complexity: medium
tags: [feature, phase-6, backend, rel-v2.0]
relevant_files:
  - src/execution/bulkExecution.ts
  - src/planning/dependencyResolver.ts
  - src/execution/types.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
`BulkExecutionManager.executeAll()` (`src/execution/bulkExecution.ts`) sorts queued specs by the numeric part of their ID and runs them in that order. It ignores `depends_on`, so a spec can run before the spec it builds on, or while a dependency is still in draft. `src/planning/dependencyResolver.ts` already provides `getExecutionOrder()` (a topological sort), but execution never uses it.

## Requirements
### Functional
- In `addSpec()`, store each queued spec's `depends_on` along with its file path.
- In `executeAll()`, before starting:
  - Order the queue with a topological sort over the queued specs (reuse or extend `getExecutionOrder` in `dependencyResolver.ts`), breaking ties by the existing numeric ID order.
  - For each queued spec, every dependency must be either `done` (read the current status from the dependency's spec file in `.specs/`) or queued earlier in the same run. Otherwise, mark the item `blocked` with a reason and do not run it.
- Add `'blocked'` to `BulkExecutionItem.status` and an optional `reason?: string` in `src/execution/types.ts`.
- During the run, when an item fails, the remaining items that depend on it (directly or transitively) become `blocked` with the reason `dependency <id> failed`. Independent items continue instead of stopping the whole run.
- A cycle among queued specs marks the involved items `blocked` with the reason `circular dependency`.

### Non-Functional
- Queues without dependencies behave as today, except that independent items continue after a failure.

## Acceptance Criteria
### Automated
- [ ] `src/execution/bulkExecution.test.ts` covers: a dependency queued after its dependent (reordered), a dependency in draft and not queued (blocked), a dependency already done (runs), a failure blocking only its dependents, a cycle, and no dependencies (numeric order).
- [ ] `src/planning/dependencyResolver.test.ts` covers any new helper.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Queue SDD-B (depends on SDD-A) before SDD-A; the run executes A first.

## Constraints
- Do not run specs in parallel.
- Builder decision: continuing independent items after a failure changes today's stop-on-first-failure behavior. Confirm before promoting to `ready`, or keep stop-on-failure behind a flag.
- Rendering `blocked` items in the Kanban UI is out of scope; existing UI must not crash on the new status (treat it like `failed`).

---
spec_id: SDD-098-NEW
title: Warn before executing a spec whose dependencies are not done
status: done
priority: medium
complexity: low
tags:
  - feature
  - phase-6
  - backend
  - rel-v2.0
relevant_files:
  - src/commands/executeSpec.ts
  - src/planning/dependencyResolver.ts
  - src/commands/executeSpec.test.ts
  - src/planning/dependencyResolver.test.ts
must_not_touch:
  - src/extension.ts
  - src/execution/bulkExecution.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
depends_on:
  - SDD-097-NEW
agent_skills: backend
created: 2026-10-15
---

## Context
A single spec can be executed (from the Kanban board, the tree view or the command palette) even when the specs listed in its `depends_on` are not `done`. The AI then builds on code that does not exist yet, which causes invented APIs and broken builds.

Bulk execution is different. After SDD-097 the bulk queue runs in the order the builder chose and shows `!` warnings for dependency problems before `Execute All`. A dependency queued earlier is in `review`, not `done`, when its dependent runs, so a prompt would fire even when the order is correct and would stall an unattended run. Specs run as part of a bulk run must skip this check.

## Requirements
### Functional
- Add `getUnmetDependencies(spec: SpecData, all: SpecData[]): string[]` to `src/planning/dependencyResolver.ts`. It returns the ids in `spec.depends_on` that are missing from `all` or not in status `done`.
- In `executeSingleSpec()`, after the status pre-flight:
  - Skip the check when the spec is part of an active bulk run: `BulkExecutionManager.getInstance().getQueue().isRunning` is true and `isInBulk(specId)` is true.
  - Otherwise, load all specs from `.specs/` and compute unmet dependencies. If there are any, show the modal warning `<specId> depends on specs that are not done: <list>. Execute anyway?` with the action `Execute Anyway`. Dismissing aborts and returns `false`, with the spec status unchanged.
- Do not change the bulk callers (`KanbanPanel.ts`, `extension.ts`); the bulk-run check above covers them.

### Non-Functional
- One scan of `.specs/` per execution at most, and none during a bulk run.

## Acceptance Criteria
### Automated
- [x] `src/planning/dependencyResolver.test.ts` covers `getUnmetDependencies` with all done, some not done, and a missing id.
- [x] `src/commands/executeSpec.test.ts` covers: no unmet dependencies (no prompt), unmet plus `Execute Anyway`, unmet plus dismiss (returns false, status unchanged), and a spec in a running bulk queue (no prompt, no scan).
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Executing a single spec whose dependency is in draft shows the warning.
- [ ] Bulk-executing SDD-A then SDD-B (B depends on A) runs both with no prompt.

## Constraints
- Do not block execution entirely; the builder can always override.

---
spec_id: SDD-103-NEW
title: Warn before executing a spec whose dependencies are not done
status: draft
priority: medium
complexity: low
tags: [feature, phase-6, backend, rel-v2.0]
relevant_files:
  - src/commands/executeSpec.ts
  - src/planning/dependencyResolver.ts
must_not_touch:
  - src/extension.ts
  - src/execution/bulkExecution.ts
depends_on: [SDD-102-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
A single spec can be executed (from the Kanban board, the tree view or the command palette) even when the specs listed in its `depends_on` are not `done`. The AI then builds on code that does not exist yet, which causes invented APIs and broken builds.

## Requirements
### Functional
- Add `getUnmetDependencies(spec: SpecData, all: SpecData[]): string[]` to `src/planning/dependencyResolver.ts`. It returns the ids in `spec.depends_on` that are missing from `all` or not in status `done`.
- In `executeSingleSpec()`, after the status pre-flight, load all specs from `.specs/` and compute unmet dependencies. If there are any, show the modal warning `<specId> depends on specs that are not done: <list>. Execute anyway?` with the action `Execute Anyway`. Dismissing aborts and returns `false`.
- Add a `skipDependencyCheck?: boolean` parameter to `executeSingleSpec` so bulk execution (which checks dependencies itself after SDD-102) can bypass the prompt. Bulk callers are updated in a follow-up if needed; the default is `false`.

### Non-Functional
- One scan of `.specs/` per execution at most.

## Acceptance Criteria
### Automated
- [ ] `src/planning/dependencyResolver.test.ts` covers `getUnmetDependencies` with all done, some not done, and a missing id.
- [ ] `src/commands/executeSpec.test.ts` covers: no unmet dependencies (no prompt), unmet plus `Execute Anyway`, unmet plus dismiss (returns false, status unchanged), and `skipDependencyCheck`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Executing a spec whose dependency is in draft shows the warning.

## Constraints
- Do not block execution entirely; the builder can always override.

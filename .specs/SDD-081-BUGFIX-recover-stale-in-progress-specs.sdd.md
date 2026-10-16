---
spec_id: SDD-081-BUGFIX
title: Recover specs stuck in in_progress after a crash or reload
status: ready
priority: high
complexity: medium
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/specs/lifecycle.ts
  - src/execution/staleRecovery.ts
  - src/extension.ts
  - src/commands/executeSpec.ts
must_not_touch:
  - src/execution/bulkExecution.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
When a spec executes, `executeSingleSpec()` writes `status: in_progress` to the spec file and only reverts it when the run completes, fails or is cancelled in the same VS Code session. If VS Code is closed, reloaded or crashes mid-run, the spec stays `in_progress` forever. The lifecycle in `src/specs/lifecycle.ts` allows only `in_progress → review`, so the builder cannot even drag the card back and must edit the YAML by hand.

**Current behavior:** After a window reload during execution, the card is stuck in "In Progress" and cannot be moved.

**Expected behavior:** On activation, any spec in `in_progress` while no execution is running in this session is treated as stale, and the builder is offered a one-click reset to `ready`. A manual `in_progress → ready` transition is also allowed.

## Requirements
### Functional
- Update `VALID_TRANSITIONS` in `src/specs/lifecycle.ts` so `in_progress` may transition to `review` or `ready`.
- Export `isExecutionRunning(): boolean` from `src/commands/executeSpec.ts`, delegating to the singleton runner.
- Create `src/execution/staleRecovery.ts` exporting:
  - `findStaleSpecs(): Promise<{ specId: string; filePath: string }[]>`: scans `.specs/**/*.sdd.md` and returns specs whose frontmatter status is `in_progress`.
  - `recoverStaleSpecs(): Promise<void>`: returns immediately if `isExecutionRunning()` is true. Otherwise, if stale specs exist, shows the warning `N spec(s) were left In Progress by a previous session.` with actions `Reset to Ready` and `Ignore`. `Reset to Ready` rewrites each spec's status to `ready` using `parseFrontmatter`/`serializeFrontmatter`.
- Call `void recoverStaleSpecs()` once at the end of `activate()` in `src/extension.ts`. This is the only change allowed in `extension.ts`.

### Non-Functional
- Recovery must never run while an execution is active.
- Activation must not be blocked; the call is fire-and-forget.

## Acceptance Criteria
### Automated
- [ ] Lifecycle tests assert `canTransition('in_progress', 'ready')` is true.
- [ ] `src/execution/staleRecovery.test.ts` covers: no stale specs (no notification), stale specs with "Reset to Ready" (files rewritten), "Ignore" (files untouched), and a running execution (no-op).
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Start an execution, reload the window, and confirm the recovery prompt appears and resets the card.

## Constraints
- Do not modify `src/extension.ts` beyond the single call.
- Do not change bulk execution behavior.

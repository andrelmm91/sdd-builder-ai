---
spec_id: SDD-081
title: Remove git diff capture from execution records and changed-files display from kanban
status: done
priority: medium
complexity: low
tags: [phase-2, bugfix, frontend, backend]
relevant_files:
  - src/execution/resultCapture.ts
  - webview-ui/src/kanban/Kanban.svelte
must_not_touch:
  - src/commands/executeSpec.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/execution/types.ts
depends_on: []
agent_skills: fullstack-dev
created: 2026-03-10
---

## Context

`resultCapture.ts` runs `git diff` and `git diff --name-status` after every execution. The full diff content is written to `.log` files, and the `changedFiles` (name-status) list is stored in `exec-*.json` records and displayed on kanban review cards.

The git diff feature is not working properly, not providing useful information, and is causing confusion for users who are not familiar with git diff. The user wants the entire git diff section removed from the SDD dashboard/kanban.

## Requirements

### Functional
- In `resultCapture.ts`, remove the `git diff` (full diff) execution and `diffContent` variable. Remove the `--- Git Diff ---` section from the log file output.
- Remove the `changed-files` expandable section from spec cards in `Kanban.svelte` — the entire block that renders when a card is in `review` status and has `changedFiles`.
- Remove the `expandedFiles` state, `toggleFiles` function, and related CSS in `Kanban.svelte`.
- The `changedFiles` field in `ExecutionRecord` (in `types.ts`) must remain for backward compatibility with existing records; only the display and capture are being removed.

### Non-Functional
- No new git subprocesses spawned during execution result capture
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds

### Manual
- [ ] Kanban cards in "review" status no longer show the "N files changed" expandable section
- [ ] Execution log files no longer contain a `--- Git Diff ---` section
- [ ] Execution still completes successfully and records are still written

## Constraints
- Do not modify `src/execution/types.ts` — `changedFiles?: string[]` field must remain as optional
- Do not modify `KanbanPanel.ts` (backend)
- Surgical removal only — do not refactor unrelated parts of either file

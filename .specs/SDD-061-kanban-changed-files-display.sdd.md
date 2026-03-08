---
spec_id: SDD-061
title: Display changed files in kanban review cards
status: done
priority: medium
complexity: medium
tags: [phase-2, refactor, frontend]
relevant_files:
  - webview-ui/src/kanban/Kanban.svelte
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/lib/types.ts
must_not_touch:
  - src/extension.ts
  - src/execution/resultCapture.ts
depends_on: [SDD-060]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

SDD-060 added `changedFiles` to `ExecutionRecord`, persisting the list of files changed during spec execution in `exec-*.json`. This spec displays those changed files on review cards in the kanban webview, giving reviewers quick visibility into what was modified.

The KanbanPanel already loads spec data and sends it to the webview. It needs to also load the latest execution record for each spec in review status and include the changed files in the data sent to the webview.

## Requirements
### Functional
- Add `changedFiles?: string[]` field to `SpecSummary` in `webview-ui/src/lib/types.ts`
- In `KanbanPanel.loadSpecs()`, for specs with status `review`, read the latest execution record via `getLatestExecution(specId)` and include `changedFiles` in the `SpecData` sent to the webview
- In `Kanban.svelte`, for cards in the "review" column, render a collapsible file list below the card content:
  - Collapsed by default, with a toggle label like "3 files changed"
  - When expanded, show each file with a change-type indicator: green "A" for added, yellow "M" for modified, red "D" for deleted
  - File paths should be displayed in monospace font
- If `changedFiles` is empty or undefined, do not show the file list section

### Non-Functional
- The file list must use VS Code theme colors (CSS variables)
- Collapsible interaction must not trigger drag events on the card

## Acceptance Criteria
### Automated
- [ ] Webview builds without errors (`npm run build:webview`)
- [ ] TypeScript compiles (`npm run type-check`)

### Manual
- [ ] Review cards show "N files changed" toggle when execution record has changed files
- [ ] Expanding the toggle shows file list with A/M/D indicators
- [ ] Cards without changed files do not show the file list section
- [ ] Clicking the toggle does not initiate a card drag

## Constraints
- Only modify `webview-ui/src/kanban/Kanban.svelte`, `src/views/webviews/kanban/KanbanPanel.ts`, and `webview-ui/src/lib/types.ts`
- Import `getLatestExecution` from `src/execution/resultCapture.ts` — do not duplicate execution record reading logic
- Do not modify the approve button behavior — approval still only transitions status to done (per SDD-059)

---
spec_id: SDD-055
title: Add bulk execution UI to Kanban board
status: draft
priority: medium
complexity: high
tags: [phase-2, frontend, ui, ai-config]
relevant_files:
  - webview-ui/src/kanban/Kanban.svelte
  - webview-ui/src/lib/types.ts
must_not_touch:
  - src/extension.ts
  - src/execution/bulkExecution.ts
depends_on: [SDD-054]
budget_max_tokens: 120000
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

The bulk execution backend (SDD-053) and wiring (SDD-054) are complete. This spec adds the user-facing bulk execution UI to the Kanban board. Users can select multiple Ready cards for bulk execution, see them grouped visually, and trigger sequential execution with real-time progress feedback.

## Requirements

### Functional
- Add an **"Add to Bulk"** button on each card in the Ready column, next to the existing "Execute" button
  - Clicking toggles the card in/out of the bulk queue via `postMessage('addToBulk'/'removeFromBulk', { specId })`
  - Cards in the bulk queue show a visual indicator (e.g., highlighted border, checkbox, or badge)
- When one or more cards are in the bulk queue, display a **grouped frame** (bordered container) in the Ready column containing the selected cards
  - Frame has an **"Execute All"** button at the top
  - Frame has a **"Clear Selection"** button to deselect all
- During bulk execution:
  - Cards in the group move to a grouped frame in the "In Progress" column
  - Currently executing card shows a loading spinner
  - Completed cards show a green checkmark icon
  - Failed cards show a red X icon
- On completion: all cards reflect their final status (review or ready depending on success/failure)
- Listen for `bulkState` messages from the extension to update UI state
- On mount, send `postMessage('requestBulkState')` to sync with any existing bulk state
- Add `BulkExecutionState` and `BulkExecutionItem` types to `webview-ui/src/lib/types.ts`

### Non-Functional
- Grouped frame must be visually distinct (border, background color) using VS Code theme variables
- Animations/transitions for cards entering/leaving the bulk group are optional but welcome
- Must not break existing drag-and-drop or single-card execution functionality

## Acceptance Criteria

### Automated
- [ ] Vite webview build succeeds
- [ ] TypeScript compilation succeeds

### Manual
- [ ] "Add to Bulk" button appears on Ready cards
- [ ] Selected cards appear in a grouped frame with "Execute All" button
- [ ] Clicking "Execute All" starts sequential execution with visual progress
- [ ] Completed cards show checkmarks, failed cards show X icons
- [ ] Existing kanban drag-and-drop still works
- [ ] Clearing selection removes all cards from the bulk group

## Constraints
- Do not modify backend bulk execution logic
- Preserve all existing Kanban functionality (drag-drop, filters, single execute)
- Use Svelte 5 runes for all reactive state

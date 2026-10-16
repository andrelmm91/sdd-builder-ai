---
spec_id: SDD-087-NEW
title: Add Discard Changes button to review cards on the Kanban board
status: ready
priority: medium
complexity: low
tags:
  - feature:GitCheckpoint
  - phase-2
  - ui
  - rel-v2.0
relevant_files:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
must_not_touch:
  - src/extension.ts
  - src/commands/reviewCommands.ts
  - webview-ui/src/lib/vscode.ts
depends_on:
  - SDD-086-NEW
agent_skills: frontend
created: 2026-10-15
---

## Context
SDD-086 added the `sdd.discardChanges` command. Most builders work from the Kanban board, so the action has to be one click away on the review card, next to Approve and Request Changes.

## Requirements
### Functional
- In `Kanban.svelte`, review-column cards show a `Discard changes` button styled as a destructive secondary button (red text or border using VS Code theme variables such as `--vscode-errorForeground`).
- Clicking it sends `postMessage('discardChanges', { specId })`. The click must call `e.stopPropagation()`, and the button must have `draggable={false}`, matching the existing file-toggle pattern.
- In `KanbanPanel.ts`, handle the `discardChanges` message by running `vscode.commands.executeCommand('sdd.discardChanges', specId)`, then reload the specs so the card's changed-files list refreshes.
- The button is hidden when the card has no `changedFiles` or the list is empty.

### Non-Functional
- Follows existing Kanban button styles and works in light, dark and high-contrast themes.

## Acceptance Criteria
### Automated
- [ ] `npm run build:webview` succeeds.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] A review card with changed files shows `Discard changes`. Clicking it opens the confirmation dialog, and after confirmation the changed-files list is empty.
- [ ] Clicking the button does not start a drag or toggle the files list.

## Constraints
- Do not implement discard logic in the webview or panel; delegate to the command.
- Do not restyle other buttons.

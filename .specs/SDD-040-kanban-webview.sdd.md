---
spec_id: SDD-040
title: Implement kanban board webview panel
status: done
priority: medium
complexity: high
tags: [phase-4, frontend]
relevant_files:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
  - webview-ui/src/kanban/index.ts
must_not_touch:
  - src/views/webviews/dashboard/DashboardPanel.ts
depends_on: [SDD-038, SDD-007, SDD-031]
budget_max_tokens: 150000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The kanban board is the primary visual interface for managing spec lifecycle. It opens as a webview panel via "SDD: Open SDD Kanban" and shows all specs grouped into 5 status columns. Cards include contextual action buttons so builders can trigger status transitions without leaving the board. A "New Spec +" button in the header opens the Spec Form panel. A search/filter bar lets builders find cards quickly by ID, title, or tag. This is a Pro tier feature.

## Requirements

### Functional

- `src/views/webviews/kanban/KanbanPanel.ts` must export:
  - `KanbanPanel` class with static `createOrShow()` method:
    - Creates a webview panel with title "SDD Kanban"
    - Sends spec list grouped by status to the webview on open and on file system changes
    - Handles `kanbanMove` messages from webview:
      - Validates transition using lifecycle module before accepting
      - Updates spec frontmatter `status:` field on valid transition
      - Sends `{ type: 'moveError', specId, message }` back on invalid transition
    - Handles `cardAction` messages: `{ type: 'cardAction', action: 'markReady' | 'execute' | 'approve' | 'requestChanges', specId }`
      - Delegates to existing commands: `sdd.markReady`, `sdd.executeSpec`, `sdd.approveSpec`, `sdd.requestChanges`
    - Handles `openSpecForm` message → calls `vscode.commands.executeCommand('sdd.newSpecForm')`
    - Handles `openFile` message: `{ type: 'openFile', specId }` → opens the spec file in the editor

- `webview-ui/src/kanban/Kanban.svelte` must render:
  - **Header bar**: title "SDD Kanban", search/filter input, "New Spec +" button
    - Search filters cards in real-time by `spec_id`, `title`, or tag
    - "New Spec +" button → `postMessage({ type: 'openSpecForm' })`
  - **5 columns**: Draft, Ready, In Progress, Review, Done
  - **Spec cards** showing:
    - `spec_id` and `title` (clicking either opens the spec file via `postMessage({ type: 'openFile', specId })`)
    - Complexity badge (color-coded: low=green, medium=yellow, high=red)
    - Priority badge (high/medium/low)
    - Tag chips (first 3 tags, truncate if more)
    - `depends_on` indicator if the spec has unresolved dependencies
  - **Contextual action buttons** per card based on `status`:
    - `draft` → `[Mark Ready]` button
    - `ready` → `[Execute]` button
    - `review` → `[Approve]` `[Request Changes]` buttons
    - `in_progress` and `done` → no action buttons
    - Button clicks → `postMessage({ type: 'cardAction', action, specId })`
  - **Drag-and-drop** between columns using HTML5 drag API:
    - Visual highlight on valid drop targets
    - Dim/red border on invalid drop targets (lifecycle-based client-side pre-validation)
    - On drop → `postMessage({ type: 'kanbanMove', specId, newStatus })`
    - On `moveError` message from extension → show inline error on card for 3 seconds
  - **Empty column** state: show placeholder text "No specs" in greyed style

### Non-Functional
- Drag-and-drop must feel responsive (<100ms visual feedback on drag start)
- Must handle 50+ spec cards without performance issues (use keyed `{#each}` in Svelte)
- Must use VS Code theme CSS variables for all colors

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Webview build completes without errors

### Manual
- [ ] Kanban board opens via "SDD: Open SDD Kanban" command
- [ ] All 5 columns render with correct specs
- [ ] Complexity and priority badges display with correct colors
- [ ] Search/filter input narrows cards in real-time
- [ ] "New Spec +" button triggers the Spec Form panel to open
- [ ] "Mark Ready" button on a draft card transitions it to ready
- [ ] "Execute" button on a ready card starts execution
- [ ] "Approve" and "Request Changes" buttons work on review cards
- [ ] Dragging a spec to a valid adjacent column updates its status in frontmatter
- [ ] Invalid drags (e.g., draft → done) show error feedback on the card
- [ ] Clicking a card's spec_id or title opens the `.sdd.md` file in the editor

## Constraints
- Must use Svelte for the webview UI
- All status transition validation must happen server-side (in KanbanPanel.ts) via the lifecycle module — client-side validation is for visual pre-feedback only
- Must use VS Code theme CSS variables (no hardcoded colors)
- The `openSpecForm` message must use `vscode.commands.executeCommand('sdd.newSpecForm')` — do not open a new webview directly from KanbanPanel

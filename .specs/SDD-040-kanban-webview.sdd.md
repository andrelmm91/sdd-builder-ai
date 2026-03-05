---
spec_id: SDD-040
title: Implement kanban board webview panel
status: draft
priority: medium
complexity: high
tags: [phase-4, frontend]
relevant_files:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
  - webview-ui/src/kanban/index.ts
must_not_touch:
  - src/views/webviews/dashboard/DashboardPanel.ts
depends_on: [SDD-038, SDD-007]
budget_max_tokens: 150000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The kanban board provides a visual, drag-and-drop interface for managing spec lifecycle. Columns represent statuses (Draft, Ready, In Progress, Review, Done), and builders can drag specs between columns to trigger status transitions. This is a premium feature (Pro tier).

## Requirements

### Functional
- `src/views/webviews/kanban/KanbanPanel.ts` must export:
  - `KanbanPanel` class:
    - Creates a webview panel with title "SDD Kanban"
    - Sends spec list grouped by status to the webview
    - Handles `kanbanMove` messages from webview (spec dragged to new column)
    - Validates status transitions using lifecycle module before accepting moves
    - Updates spec frontmatter on valid transitions
    - Sends error message back to webview on invalid transitions
- `webview-ui/src/kanban/Kanban.svelte` must render:
  - 5 columns: Draft, Ready, In Progress, Review, Done
  - Spec cards showing: spec_id, title, complexity badge, dependency indicator
  - Drag-and-drop between columns (HTML5 drag API or a Svelte drag library)
  - Visual feedback for invalid drops (e.g., can't drag from Draft to In Progress)
  - Clicking a card opens the spec file in the editor

### Non-Functional
- Drag-and-drop must feel responsive (<100ms visual feedback)
- Must handle 50+ spec cards without performance issues

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Webview build completes

### Manual
- [ ] Kanban board shows specs in correct columns
- [ ] Dragging a spec to a valid column updates its status
- [ ] Invalid drags show error feedback
- [ ] Clicking a spec card opens the file

## Constraints
- Must use Svelte for the webview UI
- Must validate all transitions server-side (in extension, not just in webview)
- Must use VS Code theme colors

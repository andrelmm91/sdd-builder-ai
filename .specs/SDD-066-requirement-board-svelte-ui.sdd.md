---
spec_id: SDD-066
title: Create requirement board Svelte webview UI
status: done
priority: high
complexity: high
tags: [phase-2, frontend, ui]
relevant_files:
  - webview-ui/src/kanban/Kanban.svelte
  - webview-ui/src/lib/vscode.ts
  - src/views/webviews/requirementBoard/types.ts
must_not_touch:
  - webview-ui/src/kanban/Kanban.svelte
  - webview-ui/src/dashboard/Dashboard.svelte
depends_on: [SDD-063]
budget_max_tokens: 150000
agent_skills: frontend-dev
created: 2026-03-09
---

## Context

The Requirement Board needs a Svelte webview component that renders a three-column kanban board for feature ideas. This follows the existing Kanban board pattern in `webview-ui/src/kanban/Kanban.svelte` but with different columns and action buttons.

The three columns are: **Feature Backlog** | **Idealization In Review** | **SDD Created**. Each card shows the feature name and has action buttons depending on its column.

## Requirements

### Functional
- Create `webview-ui/src/requirementBoard/RequirementBoard.svelte` as the main component
- Create `webview-ui/src/requirementBoard/main.ts` as the Svelte entry point (following the pattern of other webview entry points)
- Add the `requirementBoard` entry to the Vite build configuration in `webview-ui/vite.config.ts`
- Render three columns: "Feature Backlog", "Idealization In Review", "SDD Created"
- Each column displays `FeatureCard` items filtered by status
- Card display must show:
  - Feature name (title) — clickable to open the file via `openFile` message
  - Status badge
- Column-specific action buttons on each card:
  - **Feature Backlog** column: "Idealize Requirements" button → posts `idealizeRequirements` message with `{ featureName, folderPath }`
  - **Idealization In Review** column: "Create SDD Cards" button → posts `createSddCards` message with `{ featureName, folderPath }`
  - **SDD Created** column: no action buttons (terminal state)
- Add an "Add New Feature" button at the top of the board → opens the feature form (posts `showFeatureForm` message, or toggles inline form visibility)
- Listen for `requirementBoardData` messages from the extension to update the board state
- Use Svelte 5 runes (`$state`, `$derived`) for state management, matching existing patterns
- Reuse styling patterns from the existing Kanban board (card styles, column layout, button styles)

### Non-Functional
- The UI must be responsive and match the VS Code theme (use VS Code CSS variables)
- No drag-and-drop between columns (status transitions are action-driven only)
- Board must handle empty states gracefully (show placeholder text per column)

## Acceptance Criteria

### Automated
- [x] Vite build succeeds with the new entry point (`npm run build` in webview-ui)
- [x] TypeScript compilation passes

### Manual
- [ ] Three columns render correctly with appropriate headers
- [ ] Cards appear in the correct columns based on status
- [ ] Action buttons are visible only in the appropriate columns
- [ ] Clicking a card title opens the file in the editor
- [ ] "Add New Feature" button is visible at the top of the board

## Constraints
- Do not implement drag-and-drop — status changes happen via action buttons only
- Do not modify the existing Kanban Svelte component — this is a separate component
- Reuse the VS Code messaging utilities from `webview-ui/src/lib/vscode.ts`
- Follow the same Svelte component structure as the existing kanban

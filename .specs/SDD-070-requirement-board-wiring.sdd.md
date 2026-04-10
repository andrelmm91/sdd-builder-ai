---
spec_id: SDD-070
title: Wire requirement board into dashboard and extension
status: done
priority: medium
complexity: medium
tags: [phase-2, backend, ui, integration]
relevant_files:
  - src/extension.ts
  - src/views/webviews/dashboard/DashboardPanel.ts
  - webview-ui/src/dashboard/Dashboard.svelte
must_not_touch:
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: [SDD-065, SDD-066, SDD-067, SDD-068, SDD-069]
agent_skills: backend-dev
created: 2026-03-09
---

## Context

This is the final integration spec that wires all Requirement Board components together. It registers the new commands in `extension.ts`, adds the "Open Requirement Board" button to the Dashboard webview, and connects the `DashboardPanel` message handler to open the RequirementBoardPanel.

All individual components (types, parser, panel, Svelte UI, form, and AI commands) are built in prior specs. This spec only handles registration and wiring.

## Requirements

### Functional
- In `src/extension.ts`, register the following commands in the `activate()` function:
  - `sdd.openRequirementBoard` → calls `RequirementBoardPanel.createOrShow(context.extensionUri)`
  - `sdd.idealizeRequirements` → wired from `src/commands/idealizeRequirements.ts`
  - `sdd.createSddCards` → wired from `src/commands/createSddCards.ts`
- In `src/views/webviews/dashboard/DashboardPanel.ts`, add a message handler for `openRequirementBoard` that calls `RequirementBoardPanel.createOrShow(this.extensionUri)`
- In `webview-ui/src/dashboard/Dashboard.svelte`, add an "Open Requirement Board" button next to the existing "Open SDD Kanban" button that posts an `openRequirementBoard` message
- Add `sdd.openRequirementBoard` to `package.json` commands contribution if applicable

### Non-Functional
- The "Open Requirement Board" button must visually match the "Open SDD Kanban" button styling
- Importing `RequirementBoardPanel` must not cause circular dependencies

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Extension builds successfully (`npm run build`)
- [ ] No circular dependency warnings

### Manual
- [ ] "Open Requirement Board" button appears on the Dashboard next to "Open SDD Kanban"
- [ ] Clicking "Open Requirement Board" opens the RequirementBoardPanel webview
- [ ] The `sdd.openRequirementBoard` command is executable from the VS Code command palette
- [ ] The full flow works: add feature → idealize → create SDD cards → cards appear in `.specs/`

## Constraints
- Do not modify the Kanban board or any kanban-related files
- Follow the exact same registration pattern used for existing commands in `extension.ts`
- Do not add any new dependencies to `package.json` beyond what's already used

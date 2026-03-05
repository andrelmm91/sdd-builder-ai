---
spec_id: SDD-041
title: Implement structured spec form webview
status: draft
priority: low
complexity: medium
tags: [phase-4, frontend]
relevant_files:
  - src/views/webviews/specForm/SpecFormPanel.ts
  - webview-ui/src/specForm/SpecForm.svelte
  - webview-ui/src/specForm/index.ts
must_not_touch:
  - src/views/webviews/dashboard/DashboardPanel.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: [SDD-038, SDD-002]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

Some builders prefer a structured form over raw markdown editing. The spec form webview provides input fields for each frontmatter field and text areas for each markdown section, with validation feedback. Changes sync back to the `.sdd.md` file.

## Requirements

### Functional
- `src/views/webviews/specForm/SpecFormPanel.ts` must export:
  - `SpecFormPanel` class:
    - Opens alongside the raw `.sdd.md` file
    - Sends parsed spec data to the webview
    - Handles form field updates from webview → serializes back to `.sdd.md` format → saves file
    - Real-time validation: sends validation errors to webview as user types
- `webview-ui/src/specForm/SpecForm.svelte` must render:
  - Frontmatter fields as form inputs:
    - spec_id: readonly text
    - title: text input
    - status: dropdown (Draft, Ready, etc.)
    - priority: dropdown
    - complexity: dropdown
    - tags: tag input (chips)
    - relevant_files: multi-line text area or file picker
    - must_not_touch: multi-line text area
    - depends_on: multi-select from existing spec IDs
    - budget_max_tokens: number input with slider
    - agent_skills: dropdown of available skills
  - Markdown sections as rich text areas:
    - Context, Requirements (Functional + Non-Functional), Acceptance Criteria, Constraints, Examples
  - Validation errors shown inline next to fields

### Non-Functional
- Form must stay in sync with the raw file (changes in either direction)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Webview build completes

### Manual
- [ ] Form correctly displays spec data
- [ ] Editing form fields updates the .sdd.md file
- [ ] Validation errors appear inline

## Constraints
- Must use Svelte for the webview UI
- Must serialize back to valid .sdd.md format (not a different format)
- Bidirectional sync: file changes should update form and vice versa

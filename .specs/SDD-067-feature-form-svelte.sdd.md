---
spec_id: SDD-067
title: Create feature form Svelte component
status: done
priority: medium
complexity: medium
tags: [phase-2, frontend, ui]
relevant_files:
  - webview-ui/src/requirementBoard/RequirementBoard.svelte
  - webview-ui/src/specForm/SpecForm.svelte
  - webview-ui/src/lib/vscode.ts
must_not_touch:
  - webview-ui/src/specForm/SpecForm.svelte
depends_on: [SDD-066]
agent_skills: frontend-dev
created: 2026-03-09
---

## Context

The Requirement Board needs an inline form (or modal) for creating new features. When the user clicks "Add New Feature" on the Requirement Board, this form appears with fields for Feature Name, Description, Acceptance Criteria, and optional Notes. On submit, the form posts an `addFeature` message to the extension backend which creates the feature files on disk.

This component is embedded within the RequirementBoard component created in SDD-066.

## Requirements

### Functional
- Create `webview-ui/src/requirementBoard/FeatureForm.svelte` as a child component of `RequirementBoard.svelte`
- The form must include these fields:
  - **Feature Name** (text input, required) — used as folder name and card title
  - **Description** (textarea, required)
  - **Acceptance Criteria** (textarea, required)
  - **Notes** (textarea, optional)
- Form validation: Name, Description, and Acceptance Criteria must be non-empty before submit is enabled
- On submit, post an `addFeature` message with `FeatureFormData` payload to the extension
- On submit, clear the form and hide it (toggle visibility back to hidden)
- Include a "Cancel" button that hides the form without submitting
- Wire the form's visibility toggle into `RequirementBoard.svelte` (the "Add New Feature" button shows the form, Cancel/Submit hides it)

### Non-Functional
- Style the form to match VS Code's theme using CSS variables (consistent with SpecForm styling patterns)
- Use Svelte 5 runes for form state management
- Show visual feedback that fields are required (e.g., asterisk or border highlight)

## Acceptance Criteria

### Automated
- [ ] Vite build succeeds with the updated component
- [ ] TypeScript compilation passes

### Manual
- [ ] Form appears when "Add New Feature" is clicked
- [ ] Submit is disabled until required fields are filled
- [ ] On submit, form data is sent to extension and form hides
- [ ] Cancel button hides the form without sending data
- [ ] Form styling is consistent with VS Code theme

## Constraints
- Do not create a separate webview panel for the form — it must be inline within the RequirementBoard component
- Do not add any new npm dependencies for form handling
- Do not modify the SpecForm component

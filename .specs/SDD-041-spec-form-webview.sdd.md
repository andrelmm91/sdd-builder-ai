---
spec_id: SDD-041
title: Implement structured spec form webview
status: done
priority: medium
complexity: high
tags: [phase-4, frontend]
relevant_files:
  - src/views/webviews/specForm/SpecFormPanel.ts
  - webview-ui/src/specForm/SpecForm.svelte
  - webview-ui/src/specForm/index.ts
must_not_touch:
  - src/views/webviews/dashboard/DashboardPanel.ts
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: [SDD-038, SDD-002, SDD-009]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The spec form webview provides a structured UI for creating and editing `.sdd.md` specs without writing raw markdown. It has two modes:
- **Create mode**: triggered from the Kanban "New Spec +" button via `sdd.newSpecForm` command; auto-generates the next `spec_id` and starts with a blank form.
- **Edit mode**: triggered by right-clicking an existing spec in the sidebar or via `sdd.editSpecForm`; reads the existing `.sdd.md` file, parses frontmatter and all body sections, and populates the form.

On save, the form serializes all fields into a valid `.sdd.md` file (YAML frontmatter + markdown body sections) and writes it to `.specs/`. This is a Pro tier feature.

## Requirements

### Functional

- `src/views/webviews/specForm/SpecFormPanel.ts` must export:
  - `SpecFormPanel` class with:
    - `static openForCreate()`: auto-generates the next `spec_id` using the spec ID generator (SDD-009), sets `status: draft`, opens blank form with panel title "New Spec"
    - `static openForEdit(filePath: string)`: reads the existing `.sdd.md` file, parses frontmatter fields and all body sections, sends parsed data to webview, panel title "Edit: {spec_id}"
    - Message handler for `saveSpec`: `{ type: 'saveSpec', data: FormData }`
      - Serializes frontmatter (YAML) + all body sections into a valid `.sdd.md` string
      - In create mode: writes to `.specs/{spec_id}-{slug}.sdd.md` (slug derived from title)
      - In edit mode: overwrites the existing file path
      - After save: sends `{ type: 'saveSuccess' }` to webview, refreshes sidebar tree
    - Message handler for `openFile`: `{ type: 'openFile', filePath }` → opens file in editor (edit mode only)

- `webview-ui/src/specForm/SpecForm.svelte` must render a form with these sections:

  **Identity group:**
  - `spec_id`: readonly text input (generated in create, fixed in edit)
  - `title`: required text input
  - `status`: dropdown (draft, ready, in_progress, review, done)
  - `priority`: dropdown (high, medium, low)
  - `complexity`: dropdown (low, medium, high)

  **Classification group:**
  - `tags`: tag chip input (type + Enter to add, click chip × to remove)
  - `agent_skills`: dropdown of available skills (values: backend-dev, frontend-dev, sdd-planner)

  **Scope group:**
  - `relevant_files`: multi-line textarea (one path per line)
  - `must_not_touch`: multi-line textarea (one path per line)
  - `depends_on`: multi-select list of existing spec IDs (populated from extension)

  **Budget group:**
  - `budget_max_tokens`: number input + range slider (min: 10000, max: 500000, step: 10000)

  **Body sections** (each a labeled `<textarea>` with descriptive placeholder):
  - **Context**: what this spec addresses and why
  - **Requirements – Functional**: bullet list of functional requirements
  - **Requirements – Non-Functional**: performance, security, and other non-functional requirements
  - **Acceptance Criteria – Automated**: checkbox list items for automated tests
  - **Acceptance Criteria – Manual**: checkbox list items for manual verification steps
  - **Constraints**: hard limits and rules the agent must follow
  - **Examples**: input/output examples or code snippets

  **Action bar** (sticky at bottom):
  - "Save Spec" button → validates required fields → `postMessage({ type: 'saveSpec', data: formData })`
  - "Open File" button (edit mode only) → `postMessage({ type: 'openFile', filePath })`
  - Success/error status message shown after save attempt

  **Inline validation:**
  - `spec_id` format: must match `/^[A-Z]+-\d+$/`
  - `title`: required, non-empty
  - `relevant_files`: warn if empty (spec has no context for agent)
  - Required fields highlighted with red border if save attempted with missing values

### Non-Functional
- Form must be responsive and usable at narrow panel widths (≥300px)
- Must use VS Code theme CSS variables for all colors and fonts
- Textarea heights should auto-expand to content (min 3 rows, max 15 rows)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Webview build completes without errors

### Manual
- [ ] "New Spec +" in Kanban opens a blank form with auto-generated spec_id
- [ ] All frontmatter fields render as appropriate input types
- [ ] Body section textareas are labeled and have placeholder text
- [ ] Saving in create mode writes a new `.sdd.md` file to `.specs/`
- [ ] Saving in edit mode overwrites the existing file correctly
- [ ] The saved file is valid `.sdd.md` (parseable frontmatter + correct markdown sections)
- [ ] Required-field validation prevents saving and highlights missing fields
- [ ] "Open File" button (edit mode) opens the raw `.sdd.md` in the editor
- [ ] Spec ID format validation shows inline error for invalid format

## Constraints
- Must use Svelte for the webview UI
- Saved output must be a valid `.sdd.md` file parseable by `src/specs/parser.ts`
- Frontmatter serialized as YAML; body sections serialized as `## Section\n\ncontent\n`
- `spec_id` must never be editable in edit mode — it is derived from the file path
- Do not implement bidirectional file sync (file-watching) — save is explicit via button only

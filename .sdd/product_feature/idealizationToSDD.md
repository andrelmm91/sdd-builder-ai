---
status: Feature Backlog
date: 2026-03-09
---

# Feature: Idealization-to-SDD Pipeline

## Overview

Add a **Requirement Board** — a second kanban board dedicated to managing the lifecycle of feature ideas from raw input through AI-assisted idealization to SDD generation. This creates a structured upstream pipeline that feeds the existing SDD Kanban Board.

## Motivation

Currently, features go directly from informal requirements to SDD specs. This feature introduces an intermediate idealization step where AI refines raw feature descriptions into structured, team-reviewable documents before SDD decomposition. This improves requirement quality and ensures team alignment before committing to implementation.

---

## User Flow

### Phase 1: Feature Capture (Feature Backlog)

1. User clicks **"Open Requirement Board"** button in the Dashboard (next to "Open SDD Kanban").
2. A new kanban board opens with three columns: **Feature Backlog** | **Idealization In Review** | **SDD Created**.
3. User clicks **"Add New Feature"** → a form opens with fields:
   - **Feature Name** (required) — used as folder name and card title
   - **Description** (required)
   - **Acceptance Criteria** (required)
   - **Notes** (optional)
4. On submit, the extension creates:
   - Folder: `.sdd/product/{feature_name}/`
   - File: `.sdd/product/{feature_name}/{feature_name}.md`
5. The card appears in the **Feature Backlog** column.

### Phase 2: AI Idealization (Idealization In Review)

6. User clicks **"Idealize Requirements"** on a Feature Backlog card.
7. The extension invokes the AI CLI with a prompt to generate a structured idealization based on the feature file.
8. The AI creates `.sdd/product/{feature_name}/idealization.md`.
9. The extension:
   - Ensures the file is named `idealization.md` (rename if needed).
   - Sets/updates the `status` field to `Idealization In Review` and adds a `date` field.
   - Updates the original `{feature_name}.md` status to `Idealization In Review` with the current date.
10. The card moves to **Idealization In Review**. The original feature file is no longer shown on the board (the idealization file replaces it).

### Phase 3: SDD Generation (SDD Created)

11. Team reviews the idealization. User clicks **"Create SDD Cards"** on an approved idealization.
12. The extension invokes the AI CLI with a prompt to generate SDD spec files in `.specs/` based on the idealization, using the SDD Planner skill.
13. On completion:
    - `idealization.md` status → `SDD Created` (card moves to final column).
    - `{feature_name}.md` status → `SDD Created` (still hidden from the board).
    - New `.sdd.md` files appear in `.specs/`.

---

## Data Model

### File Structure

```
.sdd/product/
├── {feature_name}/
│   ├── {feature_name}.md       # Original feature description
│   └── idealization.md          # AI-generated idealization (created in Phase 2)
└── ...
```

### Feature File Format (`{feature_name}.md`)

```markdown
---
status: "Feature Backlog"          # | "Idealization In Review" | "SDD Created"
date: 2026-03-09
---

# {Feature Name}

## Description
{User-provided description}

## Acceptance Criteria
{User-provided acceptance criteria}

## Notes
{User-provided notes}
```

### Idealization File Format (`idealization.md`)

```markdown
---
status: "Idealization In Review"   # | "SDD Created"
date: 2026-03-09
---

# Idealization: {Feature Name}

{AI-generated content: structured requirements, recommendations, technical considerations, etc.}
```

### Board Display Rules

| File | Shown on Board When |
|------|-------------------|
| `{feature_name}.md` | `status === "Feature Backlog"` AND no `idealization.md` exists in same folder |
| `idealization.md` | `status === "Idealization In Review"` OR `status === "SDD Created"` |

**Key rule:** Once `idealization.md` exists, the original feature file is never shown on the board regardless of its status.

---

## Architecture & Implementation

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `RequirementBoardPanel` | WebviewPanel | New kanban board for the 3-column requirement pipeline |
| `requirementBoard/` Svelte component | Webview UI | Three-column kanban with feature cards and action buttons |
| `featureParser.ts` | Utility | Parse/write feature markdown files with YAML frontmatter |
| `featureForm` Svelte component | Webview UI | Form for creating new features |

### Modified Components

| Component | Change |
|-----------|--------|
| `DashboardPanel.ts` | Add `openRequirementBoard` message handler |
| Dashboard Svelte UI | Add "Open Requirement Board" button next to "Open SDD Kanban" |
| `extension.ts` | Register `sdd.openRequirementBoard` command |
| `constants.ts` | Add `PRODUCT_FOLDER = '.sdd/product'` constant |

### RequirementBoardPanel Design

Follow the existing `KanbanPanel` pattern:
- Extend `BaseWebviewPanel`
- Use a `FileSystemWatcher` on `.sdd/product/**/` for live updates
- Singleton pattern via `createOrShow()`
- Message types: `addFeature`, `idealizeRequirements`, `createSddCards`, `openFile`

### Board Data Loading Logic

```
1. Scan .sdd/product/*/ directories (only folders, skip loose files)
2. For each folder:
   a. Check if idealization.md exists
   b. If yes → parse idealization.md → use its status for column placement
   c. If no → parse {feature_name}.md → show only if status is "Feature Backlog"
3. Card title = folder name (feature_name)
```

### AI CLI Integration

Two AI CLI invocations, following the existing `cliRunner.ts` pattern:

**Idealize Requirements:**
```
Prompt: "Based on the following feature description, acceptance criteria and notes
in @{.sdd/product/{feature_name}/{feature_name}.md}, create a new markdown file
(named idealization.md) in the same folder with a concise idealization of this feature.
Make sure to include all the important information and recommendations.
The idealization should be clear and easy to understand for the development team."
```

**Create SDD Cards:**
```
Prompt: "Create new phases and SDDs in @.specs/ to fulfill the requirements
in @{.sdd/product/{feature_name}/idealization.md} by using skills
in @.claude/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed."
```

### Post-AI Validation

After each AI CLI call, the extension must verify and fix the output:

1. **After idealization:** Ensure file is named `idealization.md`. Ensure YAML frontmatter has `status: "Idealization In Review"` and `date` fields. Add/fix if missing.
2. **After SDD creation:** Verify `.sdd.md` files were created in `.specs/`. Update `idealization.md` and `{feature_name}.md` statuses to `SDD Created`.

---

## Recommendations

1. **Reuse existing infrastructure:** `BaseWebviewPanel`, `parseFrontmatter`/`serializeFrontmatter` from `utils/frontmatter.ts`, and `cliRunner.ts` for AI CLI calls.
2. **Feature name sanitization:** Sanitize the feature name for use as a folder name (lowercase, replace spaces with underscores, remove special characters).
3. **Error handling for AI calls:** Show progress notifications during AI CLI execution (both idealization and SDD generation can take time). Handle timeouts and failures gracefully with user-visible error messages.
4. **File watcher scope:** Watch `.sdd/product/` recursively for any `.md` file changes to keep the board in sync.
5. **Ignore legacy files:** Files directly in `.sdd/product/` (not in subdirectories) like `Idea_1_SDD_VSCode_Extension.md` should be ignored by the Requirement Board — only scan subdirectories.
6. **Svelte component reuse:** The three-column kanban UI can reuse styling and card components from the existing Kanban Board, adapting column names and action buttons.
7. **Status field consistency:** Use exact string matching for status values. Define them as a TypeScript union type: `"Feature Backlog" | "Idealization In Review" | "SDD Created"`.

---

## Out of Scope

- Editing or deleting features from the board (can be done by editing files directly)
- Drag-and-drop between columns (status transitions are action-driven, not drag-driven)
- Feature prioritization or ordering within columns
- Integration with external issue trackers

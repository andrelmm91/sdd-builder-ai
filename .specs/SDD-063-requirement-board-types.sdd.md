---
spec_id: SDD-063
title: Define requirement board types and constants
status: draft
priority: high
complexity: low
tags: [phase-2, backend, types]
relevant_files:
  - src/utils/constants.ts
  - src/specs/types.ts
must_not_touch:
  - src/views/webviews/kanban/KanbanPanel.ts
depends_on: []
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

The Idealization-to-SDD Pipeline feature introduces a Requirement Board — a second kanban board for managing feature ideas from raw input through AI-assisted idealization to SDD generation. This spec defines the foundational types and constants needed by all subsequent specs in the feature.

The requirement board has three columns (statuses): "Feature Backlog", "Idealization In Review", and "SDD Created". Feature data is stored in `.sdd/product/{feature_name}/` directories with markdown files using YAML frontmatter.

## Requirements

### Functional
- Define a `FeatureStatus` union type: `"Feature Backlog" | "Idealization In Review" | "SDD Created"`
- Define a `FeatureData` interface representing parsed feature frontmatter: `status` (FeatureStatus), `date` (string)
- Define a `FeatureCard` interface for board display: `name` (string, folder name), `title` (string), `status` (FeatureStatus), `filePath` (string, path to the file shown on board), `folderPath` (string), `hasIdealization` (boolean)
- Define a `FeatureFormData` interface for the create form: `name` (string), `description` (string), `acceptanceCriteria` (string), `notes` (string, optional)
- Add `PRODUCT_FOLDER = '.sdd/product'` constant to `constants.ts`
- Add `FEATURE_STATUSES: FeatureStatus[] = ["Feature Backlog", "Idealization In Review", "SDD Created"]` constant
- Add `IDEALIZATION_FILENAME = 'idealization.md'` constant

### Non-Functional
- All types must be exported for use by other modules
- Types must be co-located with or importable alongside existing spec types

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes with no errors (`npm run type-check`)
- [ ] All new types are exported and importable from their module

### Manual
- [ ] Type definitions match the data model described in the idealization document

## Constraints
- Do not modify any existing types or constants — only add new ones
- Place feature-related types in a new file `src/views/webviews/requirementBoard/types.ts` to keep separation from spec types
- Add constants to the existing `src/utils/constants.ts` file

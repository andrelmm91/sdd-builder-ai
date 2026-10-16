---
spec_id: SDD-008
title: Create spec templates for feature, bugfix, and refactor
status: done
priority: medium
complexity: low
tags: [phase-0, backend]
relevant_files:
  - src/specs/templates.ts
  - src/specs/types.ts
  - src/utils/constants.ts
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: [SDD-002]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

When a builder runs "SDD: New Spec from Template", the extension generates a pre-filled `.sdd.md` file based on the selected template type. This spec defines the three template types (feature, bug fix, refactor) and a function that generates the file content with placeholder values and appropriate section headings.

## Requirements

### Functional
- `src/specs/templates.ts` must export:
  - `generateSpecFromTemplate(options: TemplateOptions): string` — returns full `.sdd.md` content
  - `TemplateOptions` type: `{ template: SpecTemplate; specId: string; title?: string; tags?: string[]; created?: string }`
  - `getTemplateDescription(template: SpecTemplate): string` — returns human-readable description for Quick Pick
- Template content must include:
  - Valid YAML frontmatter with all required fields (using defaults for unspecified fields)
  - All markdown sections (Context, Requirements, Acceptance Criteria, Constraints, Examples) with placeholder text appropriate to the template type
  - Feature template: emphasis on functional requirements and automated tests
  - Bug fix template: emphasis on reproduction steps in Context, fix verification in Acceptance Criteria
  - Refactor template: emphasis on architectural constraints and must_not_touch boundaries
- Default frontmatter values: `status: draft`, `priority: medium`, `complexity: medium`, `budget_max_tokens: 100000`, `agent_skills: backend-dev`, `created: today's date`, `depends_on: []`, `relevant_files: []`, `must_not_touch: []`

### Non-Functional
- Generated content must be valid — passing it through the parser and validator should produce zero errors (except for empty relevant_files which is expected in a template)

## Acceptance Criteria

### Automated
- [x] Unit tests pass: each template type generates valid YAML frontmatter
- [x] Unit tests pass: generated content includes all required markdown sections
- [x] Unit tests pass: specId is correctly embedded in frontmatter
- [x] TypeScript compilation passes

### Manual
- [x] Generated templates are readable and provide useful guidance to builders

## Constraints
- Pure string generation — no file I/O, no VS Code API
- Do not modify types.ts or constants.ts

---
spec_id: SDD-002
title: Define core spec types and constants
status: done
priority: high
complexity: low
tags: [phase-0, backend]
relevant_files:
  - src/specs/types.ts
  - src/utils/constants.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-001]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

All modules in the SDD extension operate on structured spec data parsed from `.sdd.md` files. This spec defines the foundational TypeScript types and constants that every other module depends on. Getting these right early prevents churn across the codebase.

## Requirements

### Functional
- `src/specs/types.ts` must export:
  - `SpecStatus` enum or union type: `'draft' | 'ready' | 'in_progress' | 'review' | 'done'`
  - `SpecPriority` type: `'high' | 'medium' | 'low'`
  - `SpecComplexity` type: `'low' | 'medium' | 'high'`
  - `SpecData` interface with all frontmatter fields: `spec_id`, `title`, `status`, `priority`, `complexity`, `tags` (string[]), `relevant_files` (string[]), `must_not_touch` (string[]), `depends_on` (string[]), `budget_max_tokens` (number), `agent_skills` (string), `created` (string)
  - `SpecDocument` interface combining `SpecData` (frontmatter) with parsed markdown sections: `context`, `functionalRequirements`, `nonFunctionalRequirements`, `automatedCriteria`, `manualCriteria`, `constraints`, `examples`
  - `SpecTemplate` type: `'feature' | 'bugfix' | 'refactor'`
- `src/utils/constants.ts` must export:
  - `SPEC_FILE_EXTENSION`: `'.sdd.md'`
  - `SPECS_FOLDER`: `'.specs'`
  - `SDD_FOLDER`: `'.sdd'`
  - `CONFIG_FILE`: `'.sdd/config.json'`
  - `CONVENTIONS_FILE`: `'.sdd/conventions.md'`
  - `EXECUTIONS_FOLDER`: `'.sdd/executions'`
  - `REVIEWS_FOLDER`: `'.sdd/reviews'`
  - `SKILLS_FOLDER`: `'.sdd/skills'` (note: could also be `.claude/skills/`)
  - `DEFAULT_BUDGET`: `100000`
  - `DEFAULT_PREFIX`: `'SPEC'`
  - `STATUS_ORDER` array for lifecycle ordering

### Non-Functional
- All types must be exported (no default exports) for tree-shaking
- Types must be strict — no `any` types

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes with no errors
  - [x] All types and constants are importable from their respective modules

### Manual
- [x] Types accurately model the spec format documented in the product spec

## Constraints
- Pure type definitions and constants only — no runtime logic, no I/O
- Do not add any npm dependencies

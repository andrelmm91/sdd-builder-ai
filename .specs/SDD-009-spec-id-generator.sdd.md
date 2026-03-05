---
spec_id: SDD-009
title: Implement spec ID auto-generator
status: done
priority: medium
complexity: low
tags: [phase-0, backend]
relevant_files:
  - src/specs/specIdGenerator.ts
  - src/specs/types.ts
  - src/utils/constants.ts
must_not_touch:
  - src/specs/parser.ts
depends_on: [SDD-002]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Each spec needs a unique human-readable ID in the format `PREFIX-NNN` (e.g., `SPEC-001`, `PROJ-042`). The ID generator scans existing spec files in the `.specs/` directory, finds the highest existing number for the configured prefix, and returns the next sequential ID. This is used when creating new specs from templates or when the planner generates a batch of specs.

## Requirements

### Functional
- `src/specs/specIdGenerator.ts` must export:
  - `getNextSpecId(existingIds: string[], prefix: string): string` — returns the next sequential ID given a list of existing IDs and a prefix
  - `parseSpecId(specId: string): { prefix: string; number: number } | null` — parses a spec ID into its components
  - `generateBatchIds(count: number, existingIds: string[], prefix: string): string[]` — generates N sequential IDs for batch spec creation (used by the planner)
- ID format: `{PREFIX}-{NNN}` where NNN is zero-padded to 3 digits (e.g., `SPEC-001`)
- If no existing specs match the prefix, start at 001
- Must handle gaps in numbering (e.g., if 001, 003 exist, next is 004, not 002)

### Non-Functional
- Pure functions — no I/O (caller provides the existing IDs list)

## Acceptance Criteria

### Automated
- [x] Unit tests pass: first ID for empty list is `{PREFIX}-001`
- [x] Unit tests pass: next ID after `SPEC-005` is `SPEC-006`
- [x] Unit tests pass: gaps are skipped (after 001, 003 → next is 004)
- [x] Unit tests pass: batch generation returns correct sequential IDs
- [x] Unit tests pass: parseSpecId correctly extracts prefix and number
- [x] TypeScript compilation passes

### Manual
- [x] ID format matches spec format documented in the product spec

## Constraints
- No file I/O — caller must provide the list of existing IDs
- Do not modify types.ts or constants.ts

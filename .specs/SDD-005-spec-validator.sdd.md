---
spec_id: SDD-005
title: Implement spec validator with JSON Schema
status: done
priority: high
complexity: medium
tags: [phase-0, backend]
relevant_files:
  - src/specs/validator.ts
  - src/specs/types.ts
must_not_touch:
  - src/specs/parser.ts
  - src/extension.ts
depends_on: [SDD-002]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The validator ensures that spec files conform to the SDD format before they can be marked as "ready" or executed. It uses JSON Schema (via Ajv) to validate frontmatter fields and custom logic to check markdown section completeness. Validation results are used by the diagnostics provider (SDD-006) to show errors in VS Code.

## Requirements

### Functional
- `src/specs/validator.ts` must export:
  - `validateSpec(spec: SpecDocument): ValidationResult` — validates a parsed spec
  - `ValidationResult` type: `{ valid: boolean; errors: ValidationError[] }`
  - `ValidationError` type: `{ field: string; message: string; severity: 'error' | 'warning' }`
- Validation rules (errors):
  - `spec_id` must match pattern `{PREFIX}-{NNN}` (letters/digits, dash, digits)
  - `title` must be non-empty
  - `status` must be one of the valid SpecStatus values
  - `priority` must be one of: high, medium, low
  - `complexity` must be one of: low, medium, high
  - `tags` must be a non-empty array of strings
  - `relevant_files` must be a non-empty array of strings
  - `depends_on` must be an array (can be empty)
  - `budget_max_tokens` must be a positive number
  - `agent_skills` must be a non-empty string
  - `created` must be a valid date string (YYYY-MM-DD)
  - Context section must be non-empty
  - At least one functional requirement must exist
  - At least one automated acceptance criterion must exist
- Validation rules (warnings):
  - `relevant_files` entries that exceed 3 (excluding test files) should warn about the 3-file limit
  - `budget_max_tokens` exceeding 200000 should warn about high budget
  - Missing non-functional requirements section should warn
  - Missing constraints section should warn

### Non-Functional
- Validation must complete in under 10ms for a typical spec
- Must use Ajv for JSON Schema validation of frontmatter

## Acceptance Criteria

### Automated
- [x] Unit tests pass: valid spec returns `{ valid: true, errors: [] }`
- [x] Unit tests pass: each missing required field produces a corresponding error
- [x] Unit tests pass: boundary violations produce warnings (not errors)
- [x] Unit tests pass: invalid spec_id format produces error
- [x] TypeScript compilation passes

### Manual
- [x] Validation rules match the spec format documented in the product spec

## Constraints
- Must add `ajv` npm package for JSON Schema validation
- Pure validation logic only — no file I/O, no VS Code API calls
- Do not modify types.ts

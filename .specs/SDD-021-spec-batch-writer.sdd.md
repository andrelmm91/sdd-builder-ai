---
spec_id: SDD-021
title: Implement spec batch writer for planner output
status: ready
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/planning/specBatchWriter.ts
  - src/planning/types.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/specs/parser.ts
depends_on: [SDD-003, SDD-018, SDD-009]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

After the SDD Planner agent generates spec content, the output needs to be parsed into individual spec files and written to the `.specs/` directory. The planner outputs specs in a batch format (separated by file path headers). This module parses that output and writes each spec as a separate `.sdd.md` file with proper naming.

## Requirements

### Functional
- `src/planning/specBatchWriter.ts` must export:
  - `parsePlannerOutput(output: string): GeneratedSpec[]` — parses the planner's raw output into individual spec objects
    - Expected output format: specs separated by `=== .specs/{SPEC-ID}-{slug}.sdd.md ===` headers
    - Must handle variations in whitespace and formatting
  - `writeSpecBatch(specs: GeneratedSpec[], workspaceRoot: string): Promise<WriteBatchResult>` — writes all spec files to `.specs/` directory
  - `WriteBatchResult` type: `{ written: string[]; errors: { specId: string; error: string }[] }`
  - File naming: `.specs/{spec_id}-{slug}.sdd.md` (lowercase, hyphens)
  - Must generate slug from spec title (lowercase, replace spaces with hyphens, remove special chars)

### Non-Functional
- Must not overwrite existing spec files — return error for conflicts
- Must create `.specs/` directory if it doesn't exist

## Acceptance Criteria

### Automated
- [x] Unit tests pass: planner output is correctly parsed into individual specs
- [x] Unit tests pass: slug generation produces valid file names
- [x] Unit tests pass: existing file conflicts are reported as errors (not overwritten)
- [x] TypeScript compilation passes

### Manual
- [ ] Written files are valid `.sdd.md` files that can be parsed by the spec parser

## Constraints
- Must use fileSystem utility for all file writes
- Do not modify existing spec files
- Do not validate spec content here — that's the validator's job

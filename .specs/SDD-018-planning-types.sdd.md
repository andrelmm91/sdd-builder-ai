---
spec_id: SDD-018
title: Define planning types and requirements parser
status: draft
priority: high
complexity: low
tags: [phase-2, backend]
relevant_files:
  - src/planning/types.ts
  - src/planning/requirementsParser.ts
must_not_touch:
  - src/specs/types.ts
depends_on: [SDD-002]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The planning module decomposes builder requirements into spec files using the SDD Planner agent. Before invoking the planner, we need types for planning requests/results and a parser that structures the builder's free-text requirements input into a format the planner can consume.

## Requirements

### Functional
- `src/planning/types.ts` must export:
  - `PlanningRequest` interface: `{ requirements: string; existingSpecIds: string[]; projectPrefix: string; conventions?: string; repoTree?: string; feedback?: string }`
  - `PlanningResult` type: `{ success: true; specs: GeneratedSpec[] } | { success: false; error: string }`
  - `GeneratedSpec` interface: `{ specId: string; slug: string; content: string }` (raw .sdd.md file content)
  - `RequirementsInput` interface: `{ rawText: string; source: 'freetext' | 'file' | 'clipboard' }`
- `src/planning/requirementsParser.ts` must export:
  - `parseRequirements(input: RequirementsInput): string` — normalizes the input text (trims whitespace, removes excessive blank lines, ensures UTF-8 safe)
  - `validateRequirements(text: string): { valid: boolean; issues: string[] }` — checks minimum length (>20 chars), warns if too long (>5000 chars), checks for empty content

### Non-Functional
- Types must be clean and well-documented with JSDoc comments

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: requirements parser normalizes whitespace correctly
- [ ] Unit tests pass: validation rejects empty or too-short requirements

### Manual
- [ ] Types cover all planning workflow data needs

## Constraints
- Pure types and string processing — no I/O, no VS Code API
- Do not add dependencies

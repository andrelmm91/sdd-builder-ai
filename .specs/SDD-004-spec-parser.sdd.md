---
spec_id: SDD-004
title: Implement spec file parser
status: done
priority: high
complexity: medium
tags: [phase-0, backend]
relevant_files:
  - src/specs/parser.ts
  - src/specs/types.ts
  - src/utils/frontmatter.ts
must_not_touch:
  - src/extension.ts
  - src/utils/fileSystem.ts
depends_on: [SDD-002, SDD-003]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The spec parser is the core module that transforms raw `.sdd.md` file content into structured `SpecDocument` objects. Every feature that reads specs (sidebar tree, execution engine, validator, dashboard) depends on this parser. It uses the frontmatter utility (SDD-003) to extract YAML data and then parses the markdown body into structured sections.

## Requirements

### Functional
- `src/specs/parser.ts` must export:
  - `parseSpec(content: string): ParseResult<SpecDocument>` — parses a full `.sdd.md` file into a `SpecDocument`
  - `ParseResult<T>` type: `{ success: true; data: T } | { success: false; errors: ParseError[] }`
  - `ParseError` type: `{ message: string; line?: number }`
- Parser must:
  - Extract YAML frontmatter and map to `SpecData` fields
  - Parse markdown body into sections by `##` headers: Context, Requirements (with ### Functional and ### Non-Functional subsections), Acceptance Criteria (with ### Automated and ### Manual subsections), Constraints, Examples
  - Handle optional sections (Examples) gracefully — return empty string if missing
  - Return parse errors for missing required frontmatter fields
  - Preserve raw markdown content in each section (do not strip formatting)

### Non-Functional
- Parser must be pure (no I/O) — takes string input, returns structured output
- Must handle malformed specs without throwing exceptions

## Acceptance Criteria

### Automated
- [x] Unit tests pass: valid spec parses to correct SpecDocument
- [x] Unit tests pass: missing frontmatter fields produce ParseError
- [x] Unit tests pass: missing optional sections produce empty strings (not errors)
- [x] Unit tests pass: malformed YAML returns ParseError (not exception)
- [x] TypeScript compilation passes

### Manual
- [x] Parser output matches the spec format documented in the product spec

## Constraints
- No file I/O — parser is a pure function operating on string content
- Do not modify types.ts or frontmatter.ts — only import from them

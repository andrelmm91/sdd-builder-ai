---
spec_id: SDD-099
title: Sample spec for testing
status: draft
priority: medium
complexity: low
tags: [testing, fixture]
relevant_files:
  - src/example.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-001]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-01-15
---

## Context

This is a sample spec fixture used by the test suite. It contains all required sections with valid content to verify that the parser and validator work correctly.

## Requirements

### Functional
- The parser must extract frontmatter fields correctly
- All YAML values must map to the expected TypeScript types

### Non-Functional
- Parsing must complete in under 100ms

## Acceptance Criteria

### Automated
- [ ] Frontmatter is parsed without errors
- [ ] All required fields are present and valid

### Manual
- [ ] Spec renders correctly in the editor

## Constraints
- Must use the YAML library for parsing
- Fixture must remain a valid `.sdd.md` file

## Examples

```yaml
spec_id: SDD-099
status: draft
```

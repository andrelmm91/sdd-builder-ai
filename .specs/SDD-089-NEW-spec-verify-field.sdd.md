---
spec_id: SDD-089-NEW
title: Add optional verify commands to spec frontmatter
status: draft
priority: medium
complexity: low
tags: [feature, phase-4, backend, rel-v2.0]
relevant_files:
  - src/specs/types.ts
  - src/specs/parser.ts
  - src/specs/validator.ts
  - src/specs/completionProvider.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
Every spec has "Automated" acceptance criteria, but they are prose ("Unit tests pass for X"), so SDD cannot run them. An optional `verify` frontmatter field lets a spec author list the exact shell commands proving the spec is done, for example `npx vitest run src/execution/qualityGates.test.ts`. SDD-090 runs them as extra quality gates.

## Requirements
### Functional
- Add an optional `verify?: string[]` field to `SpecData` in `src/specs/types.ts`.
- `parseSpec()` in `src/specs/parser.ts` reads `verify` when it is an array of strings and otherwise leaves it `undefined`. It must not become a required field.
- Add `verify: { type: 'array', items: { type: 'string', minLength: 1 } }` to the validator's JSON schema (not required).
- Add a validator warning when the "Automated" criteria section exists but `verify` is absent: `Consider adding 'verify' commands so SDD can check automated criteria.`
- Add `verify` to the frontmatter key completions in `src/specs/completionProvider.ts`.

### Non-Functional
- Existing specs without `verify` must parse and validate exactly as before (apart from the new warning).

## Acceptance Criteria
### Automated
- [ ] Parser tests cover `verify` present, absent and malformed (not an array).
- [ ] Validator tests cover a valid `verify`, an empty string item (error), and the missing-verify warning.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Typing `ver` in a spec's frontmatter suggests `verify`.

## Constraints
- Do not run the commands in this spec.
- Do not change the `sdd-planner` skill file; a later docs update can do that.

---
spec_id: SDD-089-NEW
title: Create scope analyzer to classify out-of-scope file changes
status: draft
priority: high
complexity: medium
tags: [feature, phase-3, backend, rel-v2.0]
relevant_files:
  - src/execution/scopeAnalyzer.ts
  - src/execution/types.ts
  - src/utils/glob.ts
must_not_touch:
  - src/extension.ts
  - src/execution/resultCapture.ts
depends_on: [SDD-088-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
The main promise of SDD is that the AI only changes what the spec allows. Today the only check is an exact-match comparison against `must_not_touch` inside `captureResults()`, and its result is only written to a log line. Nothing checks the rule "Only modify files listed in relevant_files".

This spec adds a pure analyzer that classifies every changed file. SDD-090 persists the result, and SDD-091 shows it to the builder.

## Requirements
### Functional
- Add these types to `src/execution/types.ts`:
  - `ScopeViolationReason = 'must_not_touch' | 'outside_relevant_files'`
  - `ScopeViolation = { path: string; status: string; reason: ScopeViolationReason }`
  - `ScopeReport = { violations: ScopeViolation[]; allowed: string[] }`
- Create `src/execution/scopeAnalyzer.ts` exporting `analyzeScope(input: { changedFiles: string[]; relevantFiles: string[]; mustNotTouch: string[]; specFilePath?: string; extraAllowed?: string[] }): ScopeReport`.
- Rules, evaluated per changed file (`"<STATUS> <path>"` entries):
  1. If the path matches any `mustNotTouch` glob, it is a `must_not_touch` violation. This always wins.
  2. Otherwise the file is allowed if it matches any of:
     - a `relevantFiles` glob;
     - the spec file itself (`specFilePath`);
     - anything under `.sdd/`;
     - a test file for an allowed source file: same directory and base name with `.test.` or `.spec.` inserted before the extension, or any file under a `__tests__/` directory next to an allowed file;
     - an `extraAllowed` glob.
  3. Otherwise it is an `outside_relevant_files` violation.
- Use `matchesAny` from `src/utils/glob.ts` for all matching.

### Non-Functional
- A pure function: no I/O, no VS Code API.

## Acceptance Criteria
### Automated
- [ ] `src/execution/scopeAnalyzer.test.ts` covers: an allowed relevant file, a `must_not_touch` exact match, a `must_not_touch` glob, a file that is in both `must_not_touch` and `relevant_files` (reported as `must_not_touch`), an outside file, the spec file itself, `.sdd/` files, a sibling `.test.ts` file, a `__tests__` file, an `extraAllowed` glob, and a deleted (`D`) file outside scope.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

## Constraints
- Do not modify `resultCapture.ts` (SDD-090).
- Builder decision: confirm whether files outside `relevant_files` should count as violations or only as warnings. This spec reports them as violations, and the UI in SDD-091 can display them differently.

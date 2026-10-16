---
spec_id: SDD-090-NEW
title: Persist scope analysis results in execution records
status: draft
priority: high
complexity: low
tags: [feature, phase-3, backend, rel-v2.0]
relevant_files:
  - src/execution/resultCapture.ts
  - src/execution/types.ts
  - src/execution/scopeAnalyzer.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-084-NEW, SDD-089-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
`captureResults()` in `src/execution/resultCapture.ts` currently loads only `must_not_touch` (via `loadMustNotTouch`) and checks for exact matches, writing `Scope OK : VIOLATION DETECTED` to the log only. This spec replaces that check with `analyzeScope()` from SDD-089 and stores the structured result in the execution record so the UI and approval flow can use it.

## Requirements
### Functional
- Replace `loadMustNotTouch(specId)` with `loadSpecScope(specId): Promise<{ relevantFiles: string[]; mustNotTouch: string[]; specFilePath?: string }>`, which reads `relevant_files`, `must_not_touch` and the spec's workspace-relative file path.
- After computing `changedFiles`, call `analyzeScope(...)` and add `scopeViolations: ScopeViolation[]` to the `ExecutionRecord` (an optional field in `src/execution/types.ts`).
- Execution log changes:
  - `Scope OK : ok` when there are no violations, otherwise `Scope OK : N violation(s)`.
  - A new `--- Scope Violations ---` section listing `<reason>: <status> <path>` lines.
- `CaptureResult` also returns `scopeViolations`.

### Non-Functional
- Existing records without `scopeViolations` must still load.

## Acceptance Criteria
### Automated
- [ ] `src/execution/resultCapture.test.ts` covers: no violations, a `must_not_touch` violation, an `outside_relevant_files` violation, and a glob in `must_not_touch` matching a changed file.
- [ ] The written JSON contains `scopeViolations`, and the log contains the new section.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Execute a spec where the AI edits a file listed in `must_not_touch`; the `.log` file lists the violation.

## Constraints
- Do not block or revert anything automatically; this spec only records results.
- Do not change the Kanban UI (SDD-091).

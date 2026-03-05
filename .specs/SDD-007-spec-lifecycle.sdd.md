---
spec_id: SDD-007
title: Implement spec lifecycle state machine
status: draft
priority: high
complexity: low
tags: [phase-0, backend]
relevant_files:
  - src/specs/lifecycle.ts
  - src/specs/types.ts
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: [SDD-002]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Specs follow a strict lifecycle: `draft → ready → in_progress → review → done`. Not all transitions are valid (e.g., you can't execute a draft, you can't go from done back to in_progress). This spec implements a state machine with guards that enforce valid transitions and prevent invalid status changes.

## Requirements

### Functional
- `src/specs/lifecycle.ts` must export:
  - `canTransition(from: SpecStatus, to: SpecStatus): boolean` — returns whether a status transition is valid
  - `getValidTransitions(status: SpecStatus): SpecStatus[]` — returns all valid next statuses
  - `transitionSpec(spec: SpecData, to: SpecStatus): TransitionResult` — attempts to transition a spec, returns success or error
  - `TransitionResult` type: `{ success: true; newStatus: SpecStatus } | { success: false; error: string }`
- Valid transitions:
  - `draft → ready` (requires validation pass — caller's responsibility)
  - `ready → in_progress` (execution started)
  - `in_progress → review` (execution completed)
  - `review → done` (approved)
  - `review → ready` (request changes — re-execute)
  - `review → draft` (rejected — needs spec revision)
  - `done → draft` (reopen — rare but allowed)
- All other transitions must be rejected with a descriptive error message

### Non-Functional
- Pure functions — no side effects, no I/O

## Acceptance Criteria

### Automated
- [ ] Unit tests pass: all valid transitions return success
- [ ] Unit tests pass: all invalid transitions return error with descriptive message
- [ ] Unit tests pass: `getValidTransitions` returns correct options for each status
- [ ] TypeScript compilation passes

### Manual
- [ ] Transition rules match the lifecycle documented in the product spec

## Constraints
- No I/O, no VS Code API — pure logic module
- Do not modify types.ts

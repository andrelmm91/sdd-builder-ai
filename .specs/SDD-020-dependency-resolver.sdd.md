---
spec_id: SDD-020
title: Implement dependency resolver for spec ordering
status: draft
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/planning/dependencyResolver.ts
  - src/specs/types.ts
must_not_touch:
  - src/planning/planContextAssembler.ts
depends_on: [SDD-002]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Specs have `depends_on` fields that express execution order. Before executing a batch or validating a plan, we need to verify that the dependency graph is a valid DAG (no cycles), compute topological sort order, and detect any broken references. This module is used by both the planner (to validate generated specs) and the execution engine (to determine what can run next).

## Requirements

### Functional
- `src/planning/dependencyResolver.ts` must export:
  - `validateDependencies(specs: SpecData[]): DependencyValidation` — checks for cycles, broken references, and self-references
  - `DependencyValidation` type: `{ valid: boolean; errors: DependencyError[] }`
  - `DependencyError` type: `{ specId: string; message: string; type: 'cycle' | 'broken_ref' | 'self_ref' }`
  - `getExecutionOrder(specs: SpecData[]): string[]` — returns spec IDs in topological order (dependencies first)
  - `getReadyToExecute(specs: SpecData[]): string[]` — returns IDs of specs whose dependencies are all in 'done' status
  - `getDependencyChainDepth(specs: SpecData[]): number` — returns the longest dependency chain length
- Must handle:
  - Circular dependencies (detect and report all cycles)
  - References to non-existent spec IDs (broken refs)
  - Specs with no dependencies (independent — can execute in any order)

### Non-Functional
- Must handle 100+ specs without performance issues
- Algorithm must be deterministic (same input → same order)

## Acceptance Criteria

### Automated
- [ ] Unit tests pass: linear dependency chain produces correct order
- [ ] Unit tests pass: circular dependency is detected and reported
- [ ] Unit tests pass: broken reference is detected and reported
- [ ] Unit tests pass: independent specs are included in output
- [ ] Unit tests pass: getReadyToExecute returns only specs with all deps done
- [ ] TypeScript compilation passes

### Manual
- [ ] Dependency ordering matches expected behavior for sample spec sets

## Constraints
- Pure functions — no I/O, no VS Code API
- Use Kahn's algorithm or DFS-based topological sort
- Do not add graph library dependencies — implement directly

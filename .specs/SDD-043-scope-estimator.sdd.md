---
spec_id: SDD-043
title: Implement scope estimator
status: done
priority: low
complexity: low
tags: [phase-4, backend]
relevant_files:
  - src/analytics/scopeEstimator.ts
  - src/specs/types.ts
must_not_touch:
  - src/analytics/costTracker.ts
depends_on: [SDD-002]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Before executing a batch of specs, builders want to know the estimated scope: total spec count, complexity breakdown, estimated token budget, and dependency chain depth. The scope estimator aggregates this from a set of specs and presents it as a summary.

## Requirements

### Functional
- `src/analytics/scopeEstimator.ts` must export:
  - `estimateScope(specs: SpecData[]): ScopeEstimate`
  - `ScopeEstimate` type: `{ totalSpecs: number; byComplexity: { low: number; medium: number; high: number }; byPhase: Record<string, number>; byArea: Record<string, number>; estimatedTotalTokens: number; dependencyChainDepth: number; estimatedCost: number }`
  - `formatScopeEstimate(estimate: ScopeEstimate): string` — human-readable summary string
- Token estimate: sum of `budget_max_tokens` across all specs
- Phase/area breakdown: count specs by their tags

### Non-Functional
- Pure function — no I/O

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: scope estimate correctly counts specs by complexity
- [ ] Unit tests pass: token estimate sums budget_max_tokens
- [ ] Unit tests pass: phase/area breakdown groups by tags correctly

### Manual
- [ ] Scope summary is readable and useful for planning

## Constraints
- Pure logic — no I/O, no VS Code API
- Must use dependency resolver for chain depth calculation

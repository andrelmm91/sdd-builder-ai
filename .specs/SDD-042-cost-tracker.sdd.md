---
spec_id: SDD-042
title: Implement cost tracker analytics
status: done
priority: medium
complexity: low
tags: [phase-4, backend]
relevant_files:
  - src/analytics/costTracker.ts
  - src/execution/types.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/execution/resultCapture.ts
depends_on: [SDD-024, SDD-003]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Builders need visibility into how much their AI executions cost. The cost tracker aggregates token usage and cost data from execution records to provide per-spec and per-project analytics. This data feeds the dashboard webview.

## Requirements

### Functional
- `src/analytics/costTracker.ts` must export:
  - `getProjectCostSummary(): Promise<CostSummary>` — aggregates all execution records
  - `CostSummary` type: `{ totalTokensIn: number; totalTokensOut: number; totalCost: number; specCount: number; averageCostPerSpec: number; executionCount: number }`
  - `getSpecCostHistory(specId: string): Promise<SpecCostEntry[]>` — cost per execution for a specific spec
  - `SpecCostEntry` type: `{ executionNumber: number; tokensIn: number; tokensOut: number; cost: number; timestamp: string }`
  - `getCostByTag(tag: string): Promise<number>` — total cost for all specs with a given tag
  - Must read execution records from `.sdd/executions/` directory

### Non-Functional
- Must handle projects with 100+ execution records without lag
- Cost calculations must use configurable token pricing rates

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: cost summary correctly aggregates multiple execution records
- [ ] Unit tests pass: empty project returns zero totals

### Manual
- [ ] Cost data matches actual execution records in .sdd/executions/

## Constraints
- Read-only — do not modify execution records
- Must use fileSystem utility for reading execution records

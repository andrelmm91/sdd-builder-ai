---
spec_id: SDD-027
title: Implement token budget enforcer
status: draft
priority: medium
complexity: low
tags: [phase-2, backend]
relevant_files:
  - src/execution/budgetEnforcer.ts
  - src/execution/types.ts
must_not_touch:
  - src/execution/cliRunner.ts
depends_on: [SDD-024]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Each spec has a `budget_max_tokens` field that limits how many tokens an execution can consume. The budget enforcer performs pre-execution checks (is budget reasonable?) and post-execution validation (did execution exceed budget?). It also provides cost estimation based on token counts.

## Requirements

### Functional
- `src/execution/budgetEnforcer.ts` must export:
  - `validateBudget(budget: number): BudgetValidation` — checks if budget is within acceptable range
  - `BudgetValidation` type: `{ valid: boolean; warning?: string }`
  - Budget limits: minimum 10000, maximum 500000. Warn above 200000.
  - `checkBudgetExceeded(budget: number, tokensUsed: number): boolean` — returns true if tokens exceed budget
  - `estimateCost(tokensIn: number, tokensOut: number): number` — estimates USD cost based on Anthropic pricing (configurable rates)
  - `formatTokenCount(tokens: number): string` — human-readable format (e.g., "100K", "1.2M")
  - `getBudgetForComplexity(complexity: SpecComplexity): number` — returns recommended budget: low=50000, medium=100000, high=150000

### Non-Functional
- Pure functions — no I/O

## Acceptance Criteria

### Automated
- [ ] Unit tests pass: budget below minimum is invalid
- [ ] Unit tests pass: budget above 200000 returns warning
- [ ] Unit tests pass: cost estimation returns reasonable values
- [ ] Unit tests pass: formatTokenCount produces readable output
- [ ] TypeScript compilation passes

### Manual
- [ ] Budget recommendations align with complexity guidelines in the product spec

## Constraints
- Pure logic — no I/O, no VS Code API
- Cost rates should be configurable constants, not hardcoded

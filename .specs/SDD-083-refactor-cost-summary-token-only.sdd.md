---
spec_id: SDD-083
title: Refactor cost summary to token-only display and fix token retrieval
status: done
priority: high
complexity: medium
tags: [phase-2, bugfix, frontend, backend]
relevant_files:
  - webview-ui/src/dashboard/Dashboard.svelte
  - src/execution/cliRunner.ts
  - src/analytics/costTracker.ts
  - src/execution/resultCapture.ts
must_not_touch:
  - src/execution/types.ts
  - src/views/webviews/dashboard/DashboardPanel.ts
depends_on: []
budget_max_tokens: 120000
agent_skills: fullstack-dev
created: 2026-03-10
---

## Context

Several cost/token issues exist in the SDD dashboard:

1. **Cost summary not showing**: The dashboard shows `totalTokens` and `totalCost` but both may be 0 because token counts are not being captured correctly. The `TOKEN_PATTERN` regex in `cliRunner.ts` may not match the actual output format of current claude/copilot CLIs.

2. **UI changes required**:
   - Remove "Total cost" row (dollar amounts) — only show "Total tokens"
   - Change "Avg cost / spec" label to "Avg tokens / execution"
   - In recent activity table, replace the "Cost" column with a "Tokens" column showing `tokensIn + tokensOut`

3. **Token parsing**: The `TOKEN_PATTERN` regex in `cliRunner.ts` needs to be updated to match current CLI output formats for both Claude and Copilot.

## Requirements

### Functional
- In `Dashboard.svelte`, remove the "Total cost" `<dt>/<dd>` row from the Cost Summary section.
- In `Dashboard.svelte`, rename "Avg cost / spec" to "Avg tokens / execution" and display `totalTokens / executions.length` (or `0` if no executions) as an integer.
- In `Dashboard.svelte`, replace the "Cost" column header and cell in the Recent Activity table with "Tokens", showing `exec.tokensIn + exec.tokensOut` as a formatted number.
- Remove the `formatCost` helper function from `Dashboard.svelte` if it is no longer used.
- Remove the `totalCost` and `avgCost` derived/state variables if no longer referenced.
- In `cliRunner.ts`, update `TOKEN_PATTERN` to match token output formats from recent claude CLI versions. Check both `"Tokens: in=N out=M"` and `"tokens_input: N / tokens_output: M"` formats.
- In `costTracker.ts`, update `CostSummary` interface: remove `totalCost` and `averageCostPerSpec`, add `averageTokensPerExecution: number`. Update `getProjectCostSummary()` accordingly.

### Non-Functional
- No change to `ExecutionRecord` interface (cost field may remain for historical records)
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds

### Manual
- [ ] Cost Summary section shows "Total tokens", "Executions", and "Avg tokens / execution" — no dollar amounts
- [ ] Recent Activity table shows a "Tokens" column instead of "Cost"
- [ ] If a spec was executed and tokens were captured, the counts appear in the dashboard

## Constraints
- Do not change `ExecutionRecord.cost` field in `types.ts` — only the UI display is changing
- Do not modify `DashboardPanel.ts` — only `Dashboard.svelte`, `cliRunner.ts`, and `costTracker.ts`

---
spec_id: SDD-096-NEW
title: Derive execution timeout from spec complexity
status: review
priority: low
complexity: low
tags:
  - feature
  - phase-5
  - backend
  - rel-v2.0
relevant_files:
  - src/execution/budgetEnforcer.ts
  - src/commands/executeSpec.ts
  - src/config/aiConfigTypes.ts
  - src/config/aiConfig.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---







## Context
`CliRunner` uses a fixed 10-minute timeout (`DEFAULT_TIMEOUT_MS`) unless `ExecutionConfig.timeoutMs` is set, and nothing sets it. High-complexity specs (planned at 4–8 hours of human effort) are often killed mid-run, while low-complexity specs that hang wait too long. `budgetEnforcer.ts` already maps complexity to a token budget, which is the natural home for a timeout mapping.

## Requirements
### Functional
- Add `getTimeoutForComplexity(complexity: SpecComplexity): number` to `src/execution/budgetEnforcer.ts`, returning milliseconds: `low` → 10 min, `medium` → 20 min, `high` → 30 min.
- Add `timeoutMultiplier?: number` to `AIConfig` (`src/config/aiConfigTypes.ts`, default `1` in `DEFAULT_AI_CONFIG`) and read it in `readAIConfig()` from `ai.timeoutMultiplier` in `.sdd/config.json`. Clamp it to 0.25–10; a missing or non-numeric value falls back to `1`. Do not use VS Code settings (`vscode.workspace.getConfiguration`). The final timeout is `getTimeoutForComplexity(c) * multiplier`. The AI Configuration UI field is added by SDD-100.
- `executeSingleSpec()` sets `config.timeoutMs` from this value.
- The timeout error shown to the builder includes the limit: `Execution timed out after N minutes. Increase the execution timeout multiplier in AI Configuration.` (Per-spec `timeout_minutes` was dropped together with the original SDD-095.)

### Non-Functional
- Low-complexity specs keep today's 10-minute behavior.

## Acceptance Criteria
### Automated
- [x] `src/execution/budgetEnforcer.test.ts` covers all three complexities.
- [x] `src/config/aiConfig.test.ts` covers reading, defaulting and clamping `ai.timeoutMultiplier`.
- [x] `src/commands/executeSpec.test.ts` asserts `timeoutMs` is passed to the runner and the multiplier is applied and clamped.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] None.

## Constraints
- Do not remove `getBudgetForComplexity`; `scopeEstimator.ts` uses it.
- Do not change `CliRunner`'s timeout handling.

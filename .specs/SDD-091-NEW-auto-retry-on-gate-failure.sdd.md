---
spec_id: SDD-091-NEW
title: Automatically re-run execution with gate failure feedback
status: draft
priority: medium
complexity: high
tags: [feature, phase-4, backend, rel-v2.0]
relevant_files:
  - src/commands/executeSpec.ts
  - src/config/aiConfigTypes.ts
  - src/config/aiConfig.ts
  - src/execution/cliRunner.ts
must_not_touch:
  - src/extension.ts
  - src/execution/bulkExecution.ts
  - src/execution/qualityGates.ts
depends_on: [SDD-090-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
Vibe coders usually can't or won't debug failing tests themselves. When the AI finishes but required quality gates fail (SDD-090), the most useful next step is to send the failure output back to the AI automatically and let it fix its own work, up to a configured limit. This only makes sense in non-interactive mode (Claude `dangerously-skip-permissions`, Copilot `yolo`), where no human approves each step.

## Requirements
### Functional
- Add an optional `autoRetryMax?: number` to `AIConfig` in `src/config/aiConfigTypes.ts` (default `0`, meaning disabled; maximum `3`). Read it in `readAIConfig()` and clamp it to 0–3.
- Add an optional `extraPrompt?: string` parameter to `CliRunner.execute()` (or a field on `ExecutionConfig`). When present, append it to the prompt after the post-execution commands.
- In the non-interactive path of `executeSingleSpec()`, after gates run, if `!summary.passed` and attempts are below `autoRetryMax`:
  - Write the failure feedback to `.sdd/executions/<specId>/retry-<n>-feedback.md`. Include each failed required gate's name, command and truncated output.
  - Re-run the CLI with `extraPrompt` set to `Previous attempt failed quality checks. Read <feedback file path> and fix the problems without expanding scope.`
  - Capture results and run gates again after each attempt. Each attempt produces its own execution record.
  - Update the progress notification: `Retry n/N: fixing failed checks…`.
- Cancellation during a retry behaves exactly like cancellation during the first attempt.
- Interactive modes never retry automatically.

### Non-Functional
- Total attempts must never exceed `1 + autoRetryMax`.
- Each retry reuses the original git checkpoint so discard still restores the pre-first-attempt state.

## Acceptance Criteria
### Automated
- [ ] `src/commands/executeSpec.test.ts` covers: `autoRetryMax` 0 (no retry), gates failing then passing on retry 1 (status `review` with an info message), gates failing on all attempts (stops at the limit with a warning), cancellation mid-retry, and interactive mode never retrying.
- [ ] `src/config/aiConfig.test.ts` covers clamping `autoRetryMax`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] With `autoRetryMax: 1` and a spec that initially breaks a test, the terminal shows a second run, and the final record shows gates passing.

## Constraints
- Do not add the setting to the AI Config webview in this spec; it is edited in `.sdd/config.json`.
- Do not change the gate runner.
- Builder decision: confirm the default (`0`, disabled) before promoting to `ready`.

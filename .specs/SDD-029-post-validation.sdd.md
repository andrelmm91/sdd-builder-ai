---
spec_id: SDD-029
title: Implement post-execution test validation
status: draft
priority: medium
complexity: low
tags: [phase-2, backend]
relevant_files:
  - src/execution/postValidation.ts
  - src/execution/types.ts
  - src/utils/shell.ts
must_not_touch:
  - src/execution/cliRunner.ts
  - src/execution/resultCapture.ts
depends_on: [SDD-011, SDD-024]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

After an AI agent executes a spec and modifies code, the extension should automatically run the project's test command (e.g., `npm test`) to verify that the changes didn't break anything. The results are appended to the execution record and shown in the review flow.

## Requirements

### Functional
- `src/execution/postValidation.ts` must export:
  - `runPostValidation(config: ExecutionConfig): Promise<ValidationResult>`
  - `ValidationResult` type: `{ passed: boolean; output: string; duration: number; command: string }`
  - Must:
    1. Run the configured test command (`config.testCommand`) in the workspace root
    2. Capture stdout + stderr
    3. Determine pass/fail from exit code (0 = pass, non-zero = fail)
    4. Return results with timing data
  - Must handle:
    - Test command not found → return failed with "Command not found" message
    - Timeout (default 5 minutes) → return failed with "Timeout" message
    - Test command returns non-zero → return failed with captured output

### Non-Functional
- Must not block the UI — run async
- Must respect the `autoValidate` config flag (caller decides whether to invoke this)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: successful test returns passed=true
- [ ] Unit tests pass: failing test returns passed=false with output
- [ ] Unit tests pass: timeout is handled correctly

### Manual
- [ ] Post-validation correctly runs `npm test` after spec execution

## Constraints
- Must use shell utility for running the test command
- Do not add test framework dependencies — just execute the configured command

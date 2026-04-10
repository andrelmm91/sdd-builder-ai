---
spec_id: SDD-030
title: Wire spec execution command to VS Code UI
status: review
priority: high
complexity: medium
tags: [phase-2, frontend]
relevant_files:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/contextAssembler.ts
must_not_touch:
  - src/planning/planner.ts
depends_on: [SDD-024, SDD-025, SDD-026, SDD-027, SDD-028, SDD-029]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

All execution engine modules are built (context assembler, CLI runner, budget enforcer, result capture, post-validation). This spec wires them together into the `sdd.executeSpec` command so builders can trigger spec execution from the sidebar context menu or command palette.

## Requirements

### Functional
- Implement `sdd.executeSpec` command in `extension.ts`:
  - Pre-flight checks:
    - Spec must be in "ready" status
    - Claude CLI must be available
    - No other execution currently running
    - Budget must pass validation
  - Execution flow:
    1. Transition spec status to "in_progress"
    2. Load skills file using skillsLoader
    3. Assemble execution context
    4. Execute via CliRunner
    5. Capture results
    6. Run post-validation (if autoValidate is enabled)
    7. Update execution record with test results
    8. Transition spec status to "review"
    9. Show notification: "SPEC-XXX execution complete — ready for review"
  - On failure:
    - Show error notification
    - Keep spec in "ready" status (not "in_progress")
    - Save partial results to execution record
  - Progress indication: use `vscode.window.withProgress` with cancel support

### Non-Functional
- Must handle user cancellation gracefully (abort CLI, revert status)

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes

### Manual
- [ ] Right-clicking a "ready" spec and choosing "Execute" starts execution in terminal
- [ ] Progress notification shows during execution with cancel button
- [ ] Spec moves to "review" status after successful execution
- [ ] Error notification shown if Claude CLI is not available

## Constraints
- Must use all execution engine modules — do not duplicate their logic
- Must update sidebar tree after execution completes
- Only one spec can execute at a time (sequential execution for MVP)

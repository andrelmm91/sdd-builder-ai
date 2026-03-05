---
spec_id: SDD-023
title: Wire planning commands to VS Code UI
status: draft
priority: high
complexity: medium
tags: [phase-2, frontend]
relevant_files:
  - src/extension.ts
  - src/planning/planner.ts
  - package.json
must_not_touch:
  - src/planning/planContextAssembler.ts
  - src/planning/specBatchWriter.ts
depends_on: [SDD-022, SDD-014]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The planner orchestrator (SDD-022) handles the backend logic, but builders need a VS Code UI to trigger planning. This spec implements the "SDD: Plan Specs from Requirements" command, which opens an input panel for requirements, shows progress during planning, and opens generated specs in the editor.

## Requirements

### Functional
- Register `sdd.planFromRequirements` command in `extension.ts`:
  - Opens a multi-line input (via `vscode.window.showInputBox` or a dedicated webview input)
  - Accepts builder's requirements text
  - Shows progress notification (`vscode.window.withProgress`) during Claude CLI execution
  - On success: opens all generated spec files in editor tabs, shows info message with spec count
  - On failure: shows error message with details
- Register `sdd.refinePlan` command:
  - Opens input for feedback text
  - Re-runs planner with feedback
  - Replaces or supplements existing generated specs
- Update `package.json` with the `sdd.refinePlan` command contribution

### Non-Functional
- Progress notification must show a spinner with "Planning specs..." message
- Must be cancellable (user can cancel the Claude CLI execution)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] "SDD: Plan Specs from Requirements" appears in command palette
- [ ] Builder can input requirements and see progress during planning
- [ ] Generated spec files open in editor tabs after planning completes
- [ ] Error messages are shown if Claude CLI is not available

## Constraints
- Must use the PlannerOrchestrator from SDD-022 — do not duplicate logic
- Input mechanism: use VS Code's built-in `showInputBox` for MVP (multi-line webview can be added later)

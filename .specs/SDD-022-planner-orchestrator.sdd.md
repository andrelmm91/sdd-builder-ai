---
spec_id: SDD-022
title: Implement planner orchestrator with Claude CLI
status: draft
priority: high
complexity: high
tags: [phase-2, backend]
relevant_files:
  - src/planning/planner.ts
  - src/planning/planContextAssembler.ts
  - src/planning/specBatchWriter.ts
must_not_touch:
  - src/execution/runner.ts
depends_on: [SDD-019, SDD-020, SDD-021]
budget_max_tokens: 150000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The planner orchestrator is the main entry point for the "SDD: Plan Specs from Requirements" flow. It coordinates the full pipeline: accept builder requirements → assemble planner context → invoke Claude CLI with the SDD Planner skills → parse output → write spec files → validate dependencies → return results. This is the heart of the AI-assisted planning feature.

## Requirements

### Functional
- `src/planning/planner.ts` must export:
  - `PlannerOrchestrator` class with:
    - `plan(request: PlanningRequest): Promise<PlanningResult>` — runs the full planning pipeline
    - `refine(request: PlanningRequest): Promise<PlanningResult>` — re-runs planning with feedback from a previous attempt
  - Pipeline steps:
    1. Validate requirements input (non-empty, reasonable length)
    2. Assemble planner context using `planContextAssembler`
    3. Write context to a temporary file (`.sdd/plan-context.md`)
    4. Invoke Claude CLI via shell utility: `claude --print --context .sdd/plan-context.md` with the sdd-planner skills
    5. Parse the CLI output using `specBatchWriter.parsePlannerOutput()`
    6. Write parsed specs to `.specs/` using `specBatchWriter.writeSpecBatch()`
    7. Validate dependencies using `dependencyResolver.validateDependencies()`
    8. Return `PlanningResult` with generated specs or errors
  - Must capture token usage from Claude CLI output (if available)
  - Must handle Claude CLI errors (not installed, network failure, timeout)

### Non-Functional
- Must show progress indication (can return progress callbacks)
- Timeout: 5 minutes max for Claude CLI execution
- Must clean up temporary context file after execution

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: orchestrator calls all pipeline steps in order
- [ ] Unit tests pass: Claude CLI failure produces meaningful error in PlanningResult

### Manual
- [ ] Running the planner with sample requirements produces valid spec files in .specs/
- [ ] Generated specs have proper sequential IDs, dependency links, and frontmatter

## Constraints
- Must use shell utility for Claude CLI invocation — do not use child_process directly
- Must use the sdd-planner skills file from `.sdd/skills/` or `.claude/skills/`
- Do not implement VS Code UI (command palette, input box) here — that's done when wiring commands

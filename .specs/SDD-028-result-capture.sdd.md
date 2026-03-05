---
spec_id: SDD-028
title: Implement execution result capture and storage
status: draft
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/execution/resultCapture.ts
  - src/execution/types.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/execution/cliRunner.ts
depends_on: [SDD-024, SDD-003]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

After Claude CLI finishes executing a spec, the extension needs to capture and store the results: what files changed (via git diff), token usage, execution duration, and the full output log. This data is stored in `.sdd/executions/{spec_id}/` for review, analytics, and re-execution context.

## Requirements

### Functional
- `src/execution/resultCapture.ts` must export:
  - `captureResults(specId: string, executionResult: ExecutionResult): Promise<CaptureResult>` — captures and stores execution results
  - `CaptureResult` type: `{ record: ExecutionRecord; logPath: string; changedFiles: string[] }`
  - Must:
    1. Run `git diff --name-only` to list changed files
    2. Run `git diff` to capture full diff content
    3. Check if any changed files are in `must_not_touch` list → flag as scope violation
    4. Determine next execution number for this spec (exec-001, exec-002, etc.)
    5. Write execution record JSON to `.sdd/executions/{spec_id}/exec-{NNN}.json`
    6. Write full execution log to `.sdd/executions/{spec_id}/exec-{NNN}.log`
    7. Return the captured data
  - `getExecutionHistory(specId: string): Promise<ExecutionRecord[]>` — reads all execution records for a spec
  - `getLatestExecution(specId: string): Promise<ExecutionRecord | undefined>` — returns the most recent execution

### Non-Functional
- Must handle git not being available (skip diff capture, log warning)
- Execution records must be valid JSON

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: execution record JSON is correctly structured
- [ ] Unit tests pass: scope violations are detected when must_not_touch files are modified
- [ ] Unit tests pass: execution numbering is sequential

### Manual
- [ ] Execution records appear in `.sdd/executions/{spec_id}/` after running a spec

## Constraints
- Must use shell utility for git commands
- Must use fileSystem utility for file writes
- Must create execution directories if they don't exist

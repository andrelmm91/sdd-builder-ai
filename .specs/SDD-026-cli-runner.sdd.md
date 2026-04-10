---
spec_id: SDD-026
title: Implement Claude CLI execution runner
status: draft
priority: high
complexity: high
tags: [phase-2, backend]
relevant_files:
  - src/execution/cliRunner.ts
  - src/execution/types.ts
  - src/utils/shell.ts
must_not_touch:
  - src/planning/planner.ts
depends_on: [SDD-011, SDD-024]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The CLI runner is responsible for spawning Claude CLI in the VS Code integrated terminal, streaming output in real-time, and capturing the execution results. This is the core "execute" action that translates a spec + context into AI-generated code changes. It manages the full lifecycle: write context to temp file → spawn CLI → stream output → capture completion → parse results.

## Requirements

### Functional
- `src/execution/cliRunner.ts` must export:
  - `CliRunner` class implementing an `ExecutionRunner` interface:
    - `execute(spec: SpecDocument, context: string, config: ExecutionConfig): Promise<ExecutionResult>`
    - `abort(): void` — cancels the running execution
    - `isRunning(): boolean`
  - `ExecutionResult` type: `{ success: boolean; output: string; tokensIn: number; tokensOut: number; duration: number; error?: string }`
  - Execution flow:
    1. Write assembled context to `.sdd/context-{spec_id}.md` temp file
    2. Build Claude CLI command: `{claudeCliBinary} --print --max-tokens {budget} < context-file` (or use `--context` flag)
    3. Spawn in VS Code terminal using Terminal API for real-time streaming
    4. Capture terminal output
    5. Parse token usage from CLI output (if reported)
    6. Clean up temp context file
    7. Return `ExecutionResult`
  - Must handle:
    - Claude CLI not installed → clear error message
    - Network errors → timeout after configurable duration
    - User abort → kill the process

### Non-Functional
- Must use VS Code Terminal API so builder can watch execution in real-time
- Must support timeout (default: 10 minutes)
- Must capture output even if terminal is closed

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: CLI command is correctly constructed from config
- [x] Unit tests pass: abort sets running state to false

### Manual
- [ ] Execution appears in VS Code terminal with streaming output
- [ ] Builder can watch AI working in real-time
- [ ] Aborting stops the Claude CLI process

## Constraints
- Must display execution output through the VS Code Terminal API (via `vscode.window.createTerminal`) so
  the builder can watch AI working in real-time. A `Pseudoterminal` (custom PTY) implementation satisfies
  this requirement: the stable VS Code Terminal API does not expose an output-capture stream
  (`vscode.window.onDidWriteTerminalData` is a proposed API), so using a `Pseudoterminal` together with
  `child_process.spawn` is the correct hybrid — all display goes through VS Code, while programmatic
  capture (token counting, log storage) is handled by the process stream. Raw `child_process` without a
  VS Code terminal is not acceptable.
- Must use shell utility for pre-flight checks (is Claude CLI installed?)
- Temp context file must be cleaned up after execution

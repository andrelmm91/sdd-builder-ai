---
spec_id: SDD-011
title: Create shell command execution utility
status: draft
priority: medium
complexity: low
tags: [phase-0, backend]
relevant_files:
  - src/utils/shell.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-001]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Multiple modules need to execute shell commands: the execution engine runs Claude CLI, the GitHub integration runs git/gh commands, and post-validation runs test commands. This utility provides a safe, consistent wrapper around Node.js child processes with proper error handling, timeout support, and output capture.

## Requirements

### Functional
- `src/utils/shell.ts` must export:
  - `execCommand(command: string, options?: ExecOptions): Promise<ExecResult>` — runs a command and captures output
  - `ExecOptions` type: `{ cwd?: string; timeout?: number; env?: Record<string, string> }`
  - `ExecResult` type: `{ stdout: string; stderr: string; exitCode: number; success: boolean }`
  - `isCommandAvailable(command: string): Promise<boolean>` — checks if a CLI tool is installed (e.g., `claude`, `gh`, `git`) by running `which` / `where`
- Must handle:
  - Command timeout (default 60 seconds)
  - Non-zero exit codes (set `success: false`, don't throw)
  - Large output (limit capture to 1MB)
  - Missing commands (return meaningful error)

### Non-Functional
- Must not block the VS Code UI — all operations are async
- Must use `child_process.exec` or `child_process.spawn` from Node.js

## Acceptance Criteria

### Automated
- [ ] Unit tests pass: successful command returns stdout and exitCode 0
- [ ] Unit tests pass: failing command returns stderr and non-zero exitCode
- [ ] Unit tests pass: timeout produces appropriate error
- [ ] Unit tests pass: `isCommandAvailable` returns true for `git`, false for nonexistent command
- [ ] TypeScript compilation passes

### Manual
- [ ] Shell utility works correctly in Extension Development Host

## Constraints
- Use Node.js `child_process` — do not add external process execution libraries
- Must work on macOS, Linux, and Windows (use `which` on Unix, `where` on Windows)

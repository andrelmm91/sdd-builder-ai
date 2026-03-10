---
spec_id: SDD-078
title: Fix requirements CLI execution to use same terminal pattern as SDD execution
status: draft
priority: critical
complexity: medium
tags: [phase-2, bugfix, backend, ai]
relevant_files:
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
  - src/execution/cliCommandBuilder.ts
  - src/execution/processSpawner.ts
must_not_touch:
  - src/execution/cliRunner.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-073]
budget_max_tokens: 150000
agent_skills: backend-dev
created: 2026-03-10
---

## Context

The requirements CLI commands (`idealizeRequirements` and `createSddCards`) do not work correctly for either Copilot or Claude providers:

1. **Copilot**: `gh copilot` receives the prompt as a positional argument with no subcommand, producing "too many arguments. Expected 0 arguments but got 1." The correct invocation is `gh copilot suggest` with the prompt passed via the appropriate flag.
2. **Claude**: The command doesn't show anything on the terminal after executing. The `idealizeRequirements.ts` spawns the process but the terminal output is not visible to the user, or the claude binary is not found because the login shell environment is not set up correctly.

The SDD execution flow (`executeSpec.ts` + `cliRunner.ts`) works correctly because it uses a PTY-based terminal with login shell. The requirements commands should follow the same pattern.

## Requirements

### Functional
- Refactor `idealizeRequirements.ts` to use a shared terminal execution pattern (or reuse the pattern from `cliRunner.ts`) that spawns via the user's login shell (`process.env.SHELL || '/bin/zsh'` with `-l -c`), streams stdout/stderr to a VS Code PTY terminal, and resolves on process exit.
- Fix `buildCliCommand` in `cliCommandBuilder.ts` for the Copilot provider: use `gh copilot suggest` subcommand instead of `gh copilot`. The prompt argument must be passed with the correct flag rather than as a bare positional argument.
- Update `createSddCards.ts` to display a visible PTY terminal (like idealizeRequirements) rather than a silent background process, so the user can see AI output.
- Both commands must call the login shell with `-l` so the full user PATH (nvm, homebrew, etc.) is available.
- Cleanup of temp prompt files must still occur after execution in both commands.
- `buildCliCommand` changes must not break `cliRunner.ts` behaviour.

### Non-Functional
- No regression in the SDD execution flow (`executeSpec.ts` + `cliRunner.ts`)
- TypeScript compilation passes
- The fix must work on macOS zsh and bash login shells

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds

### Manual
- [ ] "Idealize Requirements" with Claude provider shows output in VS Code terminal and creates `idealization.md`
- [ ] "Idealize Requirements" with Copilot provider no longer errors with "too many arguments"
- [ ] "Create SDD Cards" with Claude provider shows visible terminal output
- [ ] Both commands still support timeout and cancellation

## Constraints
- Do not modify `cliRunner.ts` or `executeSpec.ts`
- Check `gh copilot suggest --help` to confirm the correct flag for passing a prompt non-interactively
- The fix must work on macOS zsh and bash login shells

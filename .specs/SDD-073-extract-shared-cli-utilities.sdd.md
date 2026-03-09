---
spec_id: SDD-073
title: Extract shared CLI command builder and process spawner
status: done
priority: medium
complexity: medium
tags: [phase-2, refactor, backend]
relevant_files:
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
  - src/execution/cliRunner.ts
  - src/utils/shell.ts
must_not_touch:
  - src/commands/executeSpec.ts
depends_on: [SDD-072]
budget_max_tokens: 120000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

After SDD-072 fixes the CLI execution mode, three files will still contain duplicated logic:

1. **`buildCommand()`** — identical in `idealizeRequirements.ts`, `createSddCards.ts`, and very similar in `cliRunner.ts` (`_buildCommand`). All three build a CLI command string from `AIConfig` with provider switching (claude vs copilot), model flag, and permission mode flag.

2. **`spawnWithCancellation()`** — identical in `idealizeRequirements.ts` and `createSddCards.ts`. Both spawn a child process with timeout, cancellation token support, and settle-once pattern.

3. **Temp prompt file handling** — both commands write a prompt to a temp file, run the CLI, and clean up. The paths are hardcoded (`.sdd/idealize-prompt.md` and `.sdd/create-sdd-cards-prompt.md`), creating a collision risk if two features are processed concurrently.

## Requirements

### Functional
- Create `src/execution/cliCommandBuilder.ts` with:
  - `buildCliCommand(options: CliCommandOptions): string` — shared command builder accepting `{ cliBinary, aiConfig, promptArg, maxTokens? }` and returning the command string. Handles both claude and copilot providers
  - Export `CliCommandOptions` interface
- Create `src/execution/processSpawner.ts` with:
  - `spawnWithCancellation(command: string, cwd: string, token: vscode.CancellationToken, timeoutMs: number): Promise<SpawnResult>` — shared process spawner with timeout and cancellation
  - Export `SpawnResult` interface: `{ success: boolean; error?: string }`
- Update `idealizeRequirements.ts` and `createSddCards.ts` to import and use the shared utilities instead of their local copies
- Delete the local `buildCommand()` and `spawnWithCancellation()` from both command files
- Use unique temp file names to prevent collision: append a timestamp or random suffix (e.g., `.sdd/tmp/idealize-{timestamp}.md`). Clean up in `finally` block
- Optionally refactor `CliRunner._buildCommand()` to also use the shared builder (if the interface is compatible without breaking changes)

### Non-Functional
- No behavioral changes — this is a pure refactor
- Maintain the same error messages and timeout values

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes (`npm run type-check`)
- [ ] All existing tests pass (`npm test`)
- [x] No duplicate `buildCommand` or `spawnWithCancellation` functions remain in command files

### Manual
- [ ] "Idealize Requirements" still works end-to-end
- [ ] "Create SDD Cards" still works end-to-end
- [x] Running two idealizations concurrently doesn't cause prompt file conflicts (unique `.sdd/tmp/idealize-{timestamp}.md` paths)

## Constraints
- Do not change `cliRunner.ts`'s public API — only optionally refactor its internal `_buildCommand` to delegate to the shared builder
- Keep the shared utilities in `src/execution/` since they are CLI execution concerns
- Maximum 3 new/modified files (excluding test files)

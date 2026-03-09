---
spec_id: SDD-072
title: Fix CLI execution mode for idealize and create-SDD commands
status: ready
priority: critical
complexity: medium
tags: [phase-2, bugfix, backend, ai]
relevant_files:
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
  - src/execution/cliRunner.ts
must_not_touch:
  - src/commands/executeSpec.ts
  - src/views/webviews/requirementBoard/RequirementBoardPanel.ts
depends_on: [SDD-068, SDD-069]
budget_max_tokens: 150000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

Both `idealizeRequirements.ts` and `createSddCards.ts` have two critical bugs that make them non-functional:

### Bug 1: `--print` flag prevents file creation
Both commands pass `--print` to the Claude CLI. The `--print` flag makes Claude output to stdout **without executing any file operations**. But these commands need the AI to **create files on disk** (`idealization.md` and `.sdd.md` specs). With `--print`, no files are ever written, so post-validation always fails.

### Bug 2: `@` file references not resolved via stdin piping
The prompts use `@.sdd/product/...` syntax to reference files, but the commands pipe the prompt via `< promptFile`. The `@` file reference syntax is a Claude CLI interactive feature — when piping via stdin, `@` references may not be expanded. The prompt should be passed as a direct argument or the file contents should be inlined.

### Current broken flow
```
buildCommand() → "claude --print < prompt.md"
                       ↑ stdout-only, no file writes
prompt contains → "@.sdd/product/feature/feature.md"
                   ↑ not resolved when piped via stdin
```

### Required working flow
The CLI must run **without** `--print` so it can create/modify files. The prompt should be passed via `--prompt` argument (or `-p`) rather than stdin piping, which properly resolves `@` references.

## Requirements

### Functional
- In both `idealizeRequirements.ts` and `createSddCards.ts`, modify `buildCommand()`:
  - **Remove** the `--print` flag — the AI must be able to create files
  - **Remove** the `< "${promptFilePath}"` stdin piping
  - **Add** `--prompt` (or `-p`) flag with the prompt content passed as a direct argument
  - Alternatively, pass the prompt file via `--prompt-file` if supported by the CLI
- The prompt text should still reference files using `@` syntax since the CLI resolves these when running interactively (non-print mode)
- Both `idealizeRequirements.ts` and `createSddCards.ts` currently use `--print` mode and stdin piping — both must be updated
- The idealize command must still write the prompt to a temp file and clean it up, OR pass the prompt inline — choose whichever approach works with the CLI's argument handling
- Ensure the `permissionMode` flag logic still works:
  - `'dangerously-skip-permissions'` → `--dangerously-skip-permissions` (allows file writes without prompting)
  - `'plan'` → `--plan`
  - Default: no extra flag (CLI will prompt user for file write permissions)
- For the Copilot provider path, apply equivalent fixes

### Non-Functional
- Keep the 10-minute timeout
- Keep cancellation support via `CancellationToken`
- The `spawnWithCancellation` function signature can remain the same

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Extension builds successfully (`npm run build`)

### Manual
- [ ] "Idealize Requirements" creates `idealization.md` in the feature folder
- [ ] "Create SDD Cards" creates `.sdd.md` files in `.specs/`
- [ ] Post-validation correctly updates frontmatter statuses
- [ ] Cancellation still works during AI execution
- [ ] Timeout triggers after 10 minutes of no response

## Constraints
- Do not modify `cliRunner.ts` — it handles spec execution which correctly uses `--print` for output capture
- Check the Claude CLI docs/help (`claude --help`) to confirm the correct flag for passing prompts non-interactively without `--print`
- The key difference: `executeSpec` uses `--print` because it captures output; idealize/createSDD commands need the AI to write files directly

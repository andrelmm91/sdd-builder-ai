---
spec_id: SDD-058
title: Inject commit and PR commands into execution context
status: done
priority: high
complexity: low
tags: [phase-2, refactor, backend]
relevant_files:
  - src/execution/contextAssembler.ts
  - src/execution/contextAssembler.test.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-056]
agent_skills: backend-dev
created: 2026-03-08
---

## Context

SDD-056 added `commitCommand`, `commitCommandEnabled`, `prCommand`, and `prCommandEnabled` fields to AIConfig. The `assembleExecutionContext` function in `contextAssembler.ts` already receives the full `AIConfig` via `options.aiConfig` and builds the prompt document sent to the CLI agent.

This spec adds a new section to the assembled context that includes the enabled commit/PR commands, so the AI agent executes them as part of its workflow.

## Requirements
### Functional
- In `assembleExecutionContext`, after the "Scope Constraints" section (section 5) and before "Previous Feedback" (section 6), add a new "## Post-Execution Commands" section
- The section must only be included if at least one command is enabled
- For each enabled command, replace `{spec_id}` with the spec's `spec_id` and `{title}` with the spec's `title` in the command string
- Format the section as instructions to the agent, e.g.:
  ```
  ## Post-Execution Commands

  After completing all implementation work, run the following commands:

  1. Commit changes: `git add -A && git commit -m "SDD-042: Add cost tracker"`
  2. Create PR: `gh pr create --title "feat: Add cost tracker (SDD-042)" --body "Implements SDD-042"`
  ```
- If only commit is enabled, only show the commit command; if only PR is enabled, only show the PR command

### Non-Functional
- Placeholder replacement must handle missing placeholders gracefully (no errors if `{spec_id}` or `{title}` is not in the command string)

## Acceptance Criteria
### Automated
- [x] TypeScript compiles (`npm run type-check`)
- [x] Unit test: when both commands are enabled, context includes both commands with placeholders replaced
- [x] Unit test: when only commitCommand is enabled, context includes only commit command
- [x] Unit test: when both are disabled, no "Post-Execution Commands" section appears
- [x] Existing context assembler tests still pass

### Manual
- [ ] None

## Constraints
- Only modify `src/execution/contextAssembler.ts` and `src/execution/contextAssembler.test.ts`
- Do not change the signature of `assembleExecutionContext`
- Append the new section after existing sections; do not reorder existing sections

---
spec_id: SDD-059
title: Remove hardcoded git operations from approve command
status: draft
priority: high
complexity: medium
tags: [phase-2, refactor, backend]
relevant_files:
  - src/commands/reviewCommands.ts
  - src/github/gitOps.ts
  - src/github/prCreator.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-056, SDD-058]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The current `createApproveSpecCommand` in `reviewCommands.ts` (lines 70-219) performs a full git workflow: creates a branch, stages files, commits, pushes, and creates a PR via `gh` CLI. With the refactor, git operations are now delegated to the AI agent via prompt commands (SDD-056/058). The approve command should be simplified to only:

1. Transition the spec status to `done`
2. Refresh the kanban view

The `gitOps.ts` and `prCreator.ts` modules remain in the codebase (other commands or future features may use them), but they are no longer called from the approve flow.

## Requirements
### Functional
- Simplify `createApproveSpecCommand` to:
  1. Resolve spec ID (existing `resolveSpecId` helper)
  2. Show confirmation dialog ("Approve spec {specId}?")
  3. Submit approval decision via `_reviewManager.submitDecision(specId, 'approve')` (this transitions status to `done` and writes review record)
  4. Call `refresh()` to update the kanban
  5. Show success notification
- Remove all references to `createBranch`, `stageFiles`, `commit`, `push`, `getChangedFiles`, `createPullRequest`, `linkPrToExecution` from the approve flow
- Remove the `vscode.window.withProgress` wrapper (no longer needed — approve is instant)
- Remove imports from `gitOps.ts` and `prCreator.ts` if they are no longer used anywhere in this file
- Keep `toSlug()` helper only if it's still used; remove if not

### Non-Functional
- The approve operation should complete in under 1 second (no network calls)

## Acceptance Criteria
### Automated
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Existing tests pass (`npm test`)

### Manual
- [ ] Approving a spec in the kanban moves it to "done" without any git operations
- [ ] No branch creation, commit, push, or PR creation occurs on approve

## Constraints
- Only modify `src/commands/reviewCommands.ts`
- Do not delete `src/github/gitOps.ts` or `src/github/prCreator.ts` — they may be used elsewhere or in future features
- Do not modify `reviewManager.ts` — the `submitDecision` method already handles the status transition
- Keep `createRequestChangesCommand` and `createRejectSpecCommand` unchanged in this spec

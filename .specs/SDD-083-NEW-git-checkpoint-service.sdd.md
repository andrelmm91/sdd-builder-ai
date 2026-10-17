---
spec_id: SDD-083-NEW
title: Create git checkpoint service to snapshot the workspace before execution
status: done
priority: high
complexity: medium
tags:
  - feature:GitCheckpoint
  - phase-2
  - backend
  - rel-v2.0
relevant_files:
  - src/execution/gitCheckpoint.ts
  - src/execution/types.ts
  - src/utils/shell.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - src/execution/resultCapture.ts
depends_on:
  - SDD-080-BUGFIX
agent_skills: backend
created: 2026-10-15
---

## Context
SDD currently has no record of the workspace state before the AI runs. `captureResults()` uses a plain `git diff --name-status`, which (a) misses new untracked files the AI creates, (b) attributes the builder's pre-existing uncommitted changes to the AI, and (c) returns nothing if the AI committed its work. There is also no way to undo an execution.

This spec creates a standalone service that takes a checkpoint of the git state before execution and computes exactly what changed since. Later specs (SDD-084 to SDD-087) wire it into execution, result capture and a "Discard changes" action. This spec does not wire anything.

## Requirements
### Functional
- Add a `GitCheckpoint` type to `src/execution/types.ts`:
  - `headSha: string`: `git rev-parse HEAD` at checkpoint time.
  - `baseSha: string`: the commit representing the full working tree at checkpoint time. Use the result of `git stash create` when the tree is dirty; otherwise `headSha`.
  - `untrackedBefore: string[]`: output of `git ls-files --others --exclude-standard`.
  - `createdAt: string`: an ISO timestamp.
- Create `src/execution/gitCheckpoint.ts` exporting:
  - `createCheckpoint(root: string, exec?: ExecFn): Promise<GitCheckpoint | undefined>`: returns `undefined` (and logs a warning) when `root` is not a git repository or git is unavailable. It must not modify the working tree, index or stash list (`git stash create` does not push to the stash list).
  - `getChangesSince(cp: GitCheckpoint, root: string, exec?: ExecFn): Promise<string[]>`: returns entries in the existing `"<STATUS> <path>"` format (`A`, `M`, `D`, and `R` for renames), combining:
    - `git diff --name-status <baseSha>`: tracked changes, including changes the AI committed, because the diff is against the working tree.
    - Untracked files now present that were not in `untrackedBefore`, reported as `A`.
  - Paths must use forward slashes and be relative to `root`, with no duplicates.
- `ExecFn` is an injectable `(cmd: string, opts: { cwd: string }) => Promise<ExecResult>` defaulting to `execCommand` from `src/utils/shell.ts`, so the service can be unit-tested without git.

### Non-Functional
- No changes to the user's git state (no commits, no stash entries, no index changes).
- Each function runs at most 4 git commands.

## Acceptance Criteria
### Automated
- [x] `src/execution/gitCheckpoint.test.ts` (with a mocked `ExecFn`) covers: clean tree, dirty tree (`baseSha` = stash sha), not a git repo (returns undefined), new untracked file reported as `A`, pre-existing untracked file not reported, AI commit after checkpoint still reported, and Windows backslash normalization.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] Running the functions against a real repo with a pre-existing modified file and a new AI-created file reports only the new file.

## Constraints
- Do not wire the service into execution or result capture (SDD-084).
- Do not add dependencies; shell out to `git`.
- Never run `git stash push`, `git reset` or `git checkout` in this spec.

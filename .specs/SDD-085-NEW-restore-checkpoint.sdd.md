---
spec_id: SDD-085-NEW
title: Add restoreCheckpoint to revert only the files an execution changed
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
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - src/commands/reviewCommands.ts
depends_on:
  - SDD-083-NEW
agent_skills: backend
created: 2026-10-15
---



## Context
Vibe coders rarely review diffs line by line. They need a safe, one-click way to throw away what the AI did on a spec and return to the exact state before the run. With the `GitCheckpoint` from SDD-083, the files an execution touched can be restored precisely while the builder's own unrelated work is left alone.

This spec adds only the restore logic. The command and UI come in SDD-086 and SDD-087.

## Requirements
### Functional
- Add `restoreCheckpoint(cp: GitCheckpoint, changedFiles: string[], root: string, exec?: ExecFn): Promise<RestoreResult>` to `src/execution/gitCheckpoint.ts`, where `RestoreResult = { restored: string[]; deleted: string[]; skipped: { path: string; reason: string }[]; headMoved: boolean }` is added to `src/execution/types.ts`.
- Behavior per entry in `changedFiles` (format `"<STATUS> <path>"`):
  - `M` or `D`: restore the file content from `cp.baseSha` (`git checkout <baseSha> -- <path>` followed by `git reset -q -- <path>` so the index is not left staged).
  - `A`: delete the file from disk if it did not exist at `baseSha` (verify with `git cat-file -e <baseSha>:<path>`), otherwise restore it from `baseSha`.
  - `R`: restore the old path and delete the new path.
- `headMoved` is `true` when the current `HEAD` differs from `cp.headSha` (the AI committed). In that case, files are still restored in the working tree, but the commits are NOT reset. The caller decides how to tell the builder.
- Any per-file failure is recorded in `skipped` and does not abort the remaining files.

### Non-Functional
- Must never touch files absent from `changedFiles`.
- Must never run `git reset --hard`, `git clean` or `git stash pop`.

## Acceptance Criteria
### Automated
- [x] `src/execution/gitCheckpoint.test.ts` (mocked `ExecFn` and file system) covers `M`, `D`, `A` (new file deleted), `A` (file existed at base, restored), `R`, a per-file failure recorded in `skipped`, and `headMoved` detection.
- [x] A test asserts that no command containing `reset --hard`, `clean` or `stash pop` is ever issued.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] In a real repo, after an AI run that modified one file and created another, restore returns the workspace to its pre-run state, and an unrelated pre-existing edit is preserved.

## Constraints
- Do not register commands or add UI.
- Do not add dependencies.

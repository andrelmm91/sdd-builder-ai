---
spec_id: SDD-035
title: Implement Git operations for spec shipping
status: done
priority: high
complexity: medium
tags: [phase-3, backend]
relevant_files:
  - src/github/gitOps.ts
  - src/utils/shell.ts
must_not_touch:
  - src/execution/cliRunner.ts
depends_on: [SDD-011]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

When a spec is approved, the extension creates a feature branch, stages the changed files, commits with a spec-derived message, and pushes to the remote. This module wraps Git CLI operations into typed functions used by the PR creator.

## Requirements

### Functional
- `src/github/gitOps.ts` must export:
  - `createBranch(specId: string, slug: string): Promise<GitResult>` — creates and checks out `sdd/{spec_id}-{slug}`
  - `stageFiles(files: string[]): Promise<GitResult>` — runs `git add` for specified files
  - `commit(specId: string, title: string): Promise<GitResult>` — commits with message `feat: {title} ({specId})`
  - `push(branchName: string): Promise<GitResult>` — pushes with `-u origin`
  - `getCurrentBranch(): Promise<string>` — returns current branch name
  - `getChangedFiles(): Promise<string[]>` — returns list of modified/added files
  - `checkoutFiles(files: string[]): Promise<GitResult>` — reverts specific files (`git checkout -- {files}`)
  - `GitResult` type: `{ success: boolean; output: string; error?: string }`
- Must handle:
  - Branch already exists → append suffix or return error
  - Push fails (no remote, auth issues) → return meaningful error
  - Dirty working tree → warn before branch creation

### Non-Functional
- All operations must be async and non-blocking
- Must work with both HTTPS and SSH Git remotes

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: branch name is correctly formatted from spec ID and slug
- [x] Unit tests pass: commit message follows convention

### Manual
- [ ] Branch creation and push work in a real Git repository

## Constraints
- Must use shell utility for all Git commands
- Must not use any Git library — shell out to `git` CLI directly
- Must not force-push or modify Git history

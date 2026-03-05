---
spec_id: SDD-032
title: Implement multi-file diff provider for review
status: draft
priority: high
complexity: medium
tags: [phase-3, frontend]
relevant_files:
  - src/review/diffProvider.ts
  - src/utils/shell.ts
must_not_touch:
  - src/review/reviewManager.ts
depends_on: [SDD-011]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

During review, builders need to see all files changed by the AI agent in VS Code's native diff viewer. This provider uses `git diff` to identify changed files and opens VS Code diff tabs for each one, allowing the builder to navigate through changes using the standard diff UI.

## Requirements

### Functional
- `src/review/diffProvider.ts` must export:
  - `DiffProvider` class with:
    - `getChangedFiles(): Promise<ChangedFile[]>` — runs `git diff --name-status` to list changed files with their change type (Added, Modified, Deleted)
    - `ChangedFile` type: `{ path: string; status: 'added' | 'modified' | 'deleted' }`
    - `openDiffForFile(filePath: string): Promise<void>` — opens VS Code diff view for a single file (current vs HEAD)
    - `openAllDiffs(): Promise<void>` — opens diff views for all changed files in separate tabs
    - `getScopeViolations(specRelevantFiles: string[], specMustNotTouch: string[]): ChangedFile[]` — returns changed files that are not in relevant_files or are in must_not_touch
  - Use `vscode.commands.executeCommand('vscode.diff', ...)` to open native diff views

### Non-Functional
- Must handle binary files (skip diff, show note)
- Must handle new files (diff against empty)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: scope violations are correctly detected
- [ ] Unit tests pass: changed files are parsed from git output

### Manual
- [ ] Diff views open for all changed files
- [ ] Added files show as new (green)
- [ ] Scope violations are highlighted or warned about

## Constraints
- Must use VS Code's built-in diff viewer — do not implement custom diff UI
- Must use shell utility for git commands

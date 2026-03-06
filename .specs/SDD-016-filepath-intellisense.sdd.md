---
spec_id: SDD-016
title: Add file path IntelliSense for spec editing
status: done
priority: low
complexity: medium
tags: [phase-1, frontend]
relevant_files:
  - src/specs/completionProvider.ts
  - src/extension.ts
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: [SDD-001, SDD-003]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

When editing `relevant_files` or `must_not_touch` fields in a `.sdd.md` file, builders should get autocomplete suggestions for file paths in the workspace. This improves the authoring experience and prevents typos in file paths.

## Requirements

### Functional
- `src/specs/completionProvider.ts` must export:
  - `SpecCompletionProvider` class implementing `vscode.CompletionItemProvider`
  - Triggers on `.sdd.md` files only
  - Provides file path completions when the cursor is on a line inside `relevant_files:` or `must_not_touch:` YAML arrays
  - Completions are workspace-relative file paths (e.g., `src/auth/login.ts`)
  - Must filter out common non-source files (node_modules, .git, dist, build)
- Register the completion provider in `extension.ts` for the `sdd-spec` language ID

### Non-Functional
- Must handle large workspaces (1000+ files) without blocking the UI
- Completions should appear within 200ms

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes

### Manual
- [ ] Typing in `relevant_files` array shows file path suggestions
- [ ] Suggestions filter as user types
- [ ] Suggestions do not appear outside of relevant_files/must_not_touch arrays

## Constraints
- Must use VS Code `CompletionItemProvider` API
- Must use `workspace.findFiles` for file listing (respects .gitignore)
- Do not modify parser.ts or validator.ts

---
spec_id: SDD-013
title: Implement spec tree view provider for sidebar
status: done
priority: high
complexity: medium
tags: [phase-1, frontend]
relevant_files:
  - src/views/sidebar/specTreeProvider.ts
  - src/views/sidebar/specTreeItem.ts
  - src/specs/types.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-002, SDD-004]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The SDD sidebar is the primary navigation interface. It shows all specs in the project grouped by status (Draft, Ready, In Progress, Review, Done). Each spec appears as a tree item with an icon, the spec ID, and the title. This spec implements the `TreeDataProvider` that reads `.sdd.md` files from the workspace and presents them in the sidebar.

## Requirements

### Functional
- `src/views/sidebar/specTreeProvider.ts` must export:
  - `SpecTreeProvider` class implementing `vscode.TreeDataProvider<SpecTreeItem>`
  - `getTreeItem(element)` returns the tree item
  - `getChildren(element?)` returns:
    - Root level: status group nodes (Draft, Ready, In Progress, Review, Done) with spec count badges
    - Under each group: spec tree items for specs in that status, sorted by spec_id
  - `refresh()` method to reload specs from disk
  - Must watch `.specs/` folder for file changes and auto-refresh
- `src/views/sidebar/specTreeItem.ts` must export:
  - `SpecTreeItem` class extending `vscode.TreeItem`
  - Label: `{spec_id}: {title}`
  - Icon: different icon per status (use built-in VS Code codicons or custom SVGs from media/)
  - Context value: set to status for context menu filtering
  - Command: clicking opens the `.sdd.md` file in the editor
  - Tooltip: shows complexity, tags, depends_on summary
- Status group tree items must:
  - Be collapsible
  - Show count in description (e.g., "Draft (3)")
  - Have a distinct icon per status group

### Non-Functional
- Must handle projects with 100+ specs without performance issues
- File watcher must use VS Code `FileSystemWatcher` API

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: tree provider returns correct groups with correct spec counts
- [x] Unit tests pass: specs are sorted by spec_id within each group

### Manual
- [ ] SDD sidebar shows specs grouped by status
- [ ] Clicking a spec opens it in the editor
- [ ] Adding/deleting a .sdd.md file updates the tree automatically

## Constraints
- Must use VS Code TreeDataProvider API
- Must use the spec parser (SDD-004) to read spec files
- Do not implement context menu actions here — that's SDD-015

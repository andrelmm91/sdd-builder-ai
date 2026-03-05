---
spec_id: SDD-017
title: Add status bar item for spec overview
status: draft
priority: low
complexity: low
tags: [phase-1, frontend]
relevant_files:
  - src/views/statusBar.ts
  - src/extension.ts
must_not_touch:
  - src/views/sidebar/specTreeProvider.ts
depends_on: [SDD-004, SDD-014]
budget_max_tokens: 50000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

A status bar item provides at-a-glance visibility of the project's SDD status without opening the sidebar. It shows spec counts and execution status in the VS Code status bar (bottom of the window).

## Requirements

### Functional
- `src/views/statusBar.ts` must export:
  - `StatusBarManager` class that:
    - Creates a `vscode.StatusBarItem` aligned to the left
    - Shows text: `SDD: {ready_count} ready, {in_progress_count} running`
    - Updates when specs change (listen to file watcher events)
    - Clicking the status bar item runs `sdd.openDashboard` command (opens dashboard or focuses sidebar if dashboard not yet implemented)
  - `activate(context: vscode.ExtensionContext): void`
  - `dispose(): void`
- Register the status bar in `extension.ts`

### Non-Functional
- Updates must be debounced (500ms) to avoid flickering during batch file changes

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] Status bar shows spec counts
- [ ] Counts update when spec status changes
- [ ] Clicking status bar item focuses the SDD sidebar

## Constraints
- Must use VS Code StatusBarItem API
- Keep it minimal — do not add icons or complex formatting

---
spec_id: SDD-051
title: Add AI Configuration button to Kanban header
status: done
priority: medium
complexity: low
tags: [phase-2, frontend, ui, ai-config]
relevant_files:
  - webview-ui/src/kanban/Kanban.svelte
  - src/views/webviews/kanban/KanbanPanel.ts
must_not_touch:
  - src/extension.ts
  - webview-ui/src/aiConfig/AiConfig.svelte
depends_on: [SDD-050]
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

The AI Configuration panel (SDD-050) is now accessible via the `sdd.openAiConfig` command. This spec adds a visible "AI Configuration" button to the Kanban board header, next to the existing "New Spec +" button, so users can quickly access the configuration panel from the main workflow view.

## Requirements

### Functional
- Add an "AI Configuration" button in the Kanban header bar, positioned next to the "New Spec +" button
  - Button should use a gear/settings icon or label "AI Configuration"
  - On click, send `postMessage('openAiConfig')` to the extension
- In `KanbanPanel.ts`, handle the `openAiConfig` message by executing the `sdd.openAiConfig` command via `vscode.commands.executeCommand('sdd.openAiConfig')`

### Non-Functional
- Button style must match existing Kanban header buttons
- Button must not disrupt existing header layout

## Acceptance Criteria

### Automated
- [ ] Vite webview build succeeds
- [ ] TypeScript compilation succeeds

### Manual
- [ ] "AI Configuration" button is visible in the Kanban board header
- [ ] Clicking the button opens the AI Configuration panel
- [ ] Button styling is consistent with existing header buttons

## Constraints
- Do not modify the AI Configuration panel itself
- Minimal changes to Kanban.svelte — only add the button element and click handler
- Do not change existing Kanban functionality

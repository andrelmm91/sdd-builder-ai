---
spec_id: SDD-065
title: Create RequirementBoardPanel webview panel
status: done
priority: high
complexity: high
tags: [phase-2, backend, ui]
relevant_files:
  - src/views/webviews/BaseWebviewPanel.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/views/webviews/requirementBoard/featureParser.ts
  - src/views/webviews/requirementBoard/types.ts
must_not_touch:
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/views/webviews/dashboard/DashboardPanel.ts
depends_on: [SDD-063, SDD-064]
agent_skills: backend-dev
created: 2026-03-09
---

## Context

The RequirementBoardPanel is the backend controller for the Requirement Board webview. It follows the existing `KanbanPanel` pattern — extending `BaseWebviewPanel`, using a singleton pattern, watching the filesystem for changes, and handling messages from the Svelte frontend.

This panel manages the three-column kanban board for feature ideas: Feature Backlog → Idealization In Review → SDD Created. It does NOT handle the AI CLI calls directly — those are wired via VS Code commands in a later spec.

## Requirements

### Functional
- Create `src/views/webviews/requirementBoard/RequirementBoardPanel.ts` extending `BaseWebviewPanel`
- Implement singleton pattern via `static createOrShow(extensionUri: vscode.Uri)`
- Use viewType `sddRequirementBoard` and title `"Requirement Board"`
- On panel creation, call `loadFeatureCards()` and post data to webview via `this.post('requirementBoardData', cards)`
- Set up a `FileSystemWatcher` on `.sdd/product/**/*.md` to reload and re-post data on file create/change/delete
- Handle the following message types from the webview:
  - `addFeature`: Receive `FeatureFormData`, call `createFeatureFile()`, reload board
  - `idealizeRequirements`: Receive `{ featureName: string, folderPath: string }`, execute `vscode.commands.executeCommand('sdd.idealizeRequirements', featureName, folderPath)`
  - `createSddCards`: Receive `{ featureName: string, folderPath: string }`, execute `vscode.commands.executeCommand('sdd.createSddCards', featureName, folderPath)`
  - `openFile`: Receive `{ filePath: string }`, open the file in the editor via `vscode.window.showTextDocument`
- Dispose the file watcher when the panel is disposed

### Non-Functional
- Follow the exact same patterns used in `KanbanPanel.ts` for consistency
- Show loading state while scanning product folder
- Handle errors from file operations gracefully with `vscode.window.showErrorMessage`

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Extension builds successfully (`npm run build`)

### Manual
- [ ] Panel opens as a webview tab when `RequirementBoardPanel.createOrShow()` is called
- [ ] Board data reloads automatically when files in `.sdd/product/` are modified
- [ ] `idealizeRequirements` and `createSddCards` messages correctly delegate to VS Code commands

## Constraints
- Do not implement AI CLI logic in this panel — delegate via `vscode.commands.executeCommand`
- Do not modify `BaseWebviewPanel.ts`
- Do not modify `KanbanPanel.ts` — this is an independent panel
- The webview HTML bundle name must be `requirementBoard` (matching the Svelte entry point created in SDD-066)

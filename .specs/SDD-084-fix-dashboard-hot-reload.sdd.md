---
spec_id: SDD-084
title: Fix dashboard hot-reload for manually added SDD spec files
status: done
priority: medium
complexity: low
tags: [phase-2, bugfix, backend]
relevant_files:
  - src/views/webviews/dashboard/DashboardPanel.ts
  - src/views/webviews/kanban/KanbanPanel.ts
must_not_touch:
  - webview-ui/src/dashboard/Dashboard.svelte
  - webview-ui/src/kanban/Kanban.svelte
depends_on: []
agent_skills: backend-dev
created: 2026-03-10
---

## Context

When a user manually creates a `.sdd.md` file in the `.specs/` folder (e.g. by copying from a terminal or dragging into VS Code), the SDD dashboard does not update automatically. The user must reload the webview to see the new spec.

`DashboardPanel.ts` sets up a `FileSystemWatcher` on `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}` which should fire `onDidCreate`. The same pattern works correctly in `KanbanPanel.ts`.

The likely cause is a race condition: the watcher fires before the webview is ready to receive messages, so `sendData()` sends data to an uninitialized webview. The fix is to handle a `refresh` message from the webview on mount so the initial load always gets fresh data.

## Requirements

### Functional
- In `DashboardPanel.ts`, ensure the `FileSystemWatcher` covers new files created after the panel is open. Verify the watcher glob pattern is correct for files created directly in the `.specs/` folder.
- Add a `'refresh'` message handler in `DashboardPanel.handleMessage()` that calls `this.sendData()`. This allows the Svelte component to request fresh data on mount.
- In `Dashboard.svelte`, after the `onMessage` handler is registered in `onMount`, post a `'refresh'` message to ensure data is loaded even if the initial `sendData()` fired before the webview was ready.
- Verify that both `KanbanPanel` and `DashboardPanel` watchers use `vscode.workspace.createFileSystemWatcher` correctly.

### Non-Functional
- No performance impact — the refresh only fires on file system events or explicit request
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes

### Manual
- [ ] Create a `.sdd.md` file manually in the `.specs/` folder while the dashboard is open — it appears in the dashboard within 2 seconds without a manual refresh
- [ ] The dashboard loads its data correctly on initial open

## Constraints
- Minimal fix — do not refactor the webview lifecycle or message protocol
- Do not modify `Dashboard.svelte` beyond adding the `postMessage('refresh', {})` call in `onMount`

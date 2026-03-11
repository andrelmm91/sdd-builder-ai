---
spec_id: SDD-039
title: Implement dashboard webview panel
status: done
priority: medium
complexity: high
tags: [phase-4, frontend]
relevant_files:
  - src/views/webviews/dashboard/DashboardPanel.ts
  - webview-ui/src/dashboard/Dashboard.svelte
  - webview-ui/src/dashboard/index.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-038, SDD-028]
budget_max_tokens: 150000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The dashboard webview provides a project overview: spec counts by status, completion percentage, recent execution activity, and cost summary. It's the main analytics view for builders to understand project progress at a glance.

## Requirements

### Functional
- `src/views/webviews/dashboard/DashboardPanel.ts` must export:
  - `DashboardPanel` class extending a base webview panel:
    - Creates/reveals a webview panel with title "Builder Dashboard"
    - Loads the built Svelte app from `dist/webviews/dashboard/`
    - Sends spec data, execution records, and cost data to the webview via postMessage
    - Handles navigation messages from the webview (e.g., "open spec X")
    - Refreshes data when specs change
- `webview-ui/src/dashboard/Dashboard.svelte` must render:
  - **Spec Status Summary** — counts per status with visual bars (Draft: N, Ready: N, etc.)
  - **Completion Progress** — percentage bar: done specs / total specs
  - **Recent Activity** — last 10 execution events with spec ID, timestamp, status
  - **Cost Summary** — total tokens used, estimated cost, average per spec
  - **Phase Breakdown** — spec counts grouped by phase tag

### Non-Functional
- Dashboard must render within 500ms of opening
- Must use VS Code webview theming (inherit editor colors)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Webview build completes

### Manual
- [ ] "SDD: Open Dashboard" shows a webview with project overview data
- [ ] Data refreshes when specs change
- [ ] Dashboard uses VS Code theme colors (works in dark and light themes)

## Constraints
- Must use Svelte for the webview UI
- Data must flow from extension → webview via postMessage (no direct file access from webview)
- Must use VS Code's webview CSS variables for theming

---
spec_id: SDD-071
title: Fix Requirement Board webview viewType mismatch
status: done
priority: critical
complexity: low
tags: [phase-2, bugfix, ui]
relevant_files:
  - src/views/webviews/requirementBoard/RequirementBoardPanel.ts
  - webview-ui/vite.config.ts
must_not_touch:
  - src/views/webviews/BaseWebviewPanel.ts
depends_on: [SDD-065]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

The Requirement Board webview panel **renders blank** because of a naming mismatch between the Vite build output and the viewType passed to `BaseWebviewPanel`.

All other webview panels use the `sdd` prefix convention:
- `DashboardPanel` → viewType `sddDashboard` → Vite entry `sddDashboard`
- `KanbanPanel` → viewType `sddKanban` → Vite entry `sddKanban`
- `SpecFormPanel` → viewType `sddSpecForm` → Vite entry `sddSpecForm`
- `AiConfigPanel` → viewType `sddAiConfig` → Vite entry `sddAiConfig`

But `RequirementBoardPanel` passes `'requirementBoard'` as viewType, while the Vite config outputs `sddRequirementBoard.js`. `BaseWebviewPanel.getHtml()` uses the viewType to locate the JS file (`${viewType}.js`), so it looks for `requirementBoard.js` which doesn't exist.

## Requirements

### Functional
- In `src/views/webviews/requirementBoard/RequirementBoardPanel.ts`, change the viewType from `'requirementBoard'` to `'sddRequirementBoard'` in the `super()` call on line 20

### Non-Functional
- Follow the existing `sdd` prefix naming convention used by all other panels

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes (`npm run type-check`)
- [x] Webview build produces `dist/webviews/sddRequirementBoard.js` (`npm run build:webview`)

### Manual
- [x] Opening the Requirement Board renders the Svelte UI (not a blank panel)
- [x] CSS styles load correctly alongside the JS bundle

## Constraints
- Only change the viewType string — do not modify `BaseWebviewPanel.ts` or the Vite config
- This is a one-line fix in `RequirementBoardPanel.ts` line 20

---
spec_id: SDD-096-NEW
title: Show quality gate results on Kanban review cards
status: draft
priority: medium
complexity: low
tags: [feature, phase-4, ui, rel-v2.0]
relevant_files:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/lib/types.ts
  - webview-ui/src/kanban/Kanban.svelte
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
  - webview-ui/src/lib/vscode.ts
depends_on: [SDD-094-NEW, SDD-091-NEW]
agent_skills: frontend
created: 2026-10-15
---

## Context
SDD-094 stores `gates: GateRunSummary` in each execution record. Showing a pass/fail summary on the review card lets a builder judge a spec at a glance without opening logs.

## Requirements
### Functional
- Add `gates?: { passed: boolean; results: { name: string; passed: boolean; required: boolean }[] }` to `SpecSummary` in `webview-ui/src/lib/types.ts`. Do not send gate output to the webview.
- In `KanbanPanel.loadSpecs()`, inject `gates` from the latest execution record for review specs, without the `output` and `command` fields.
- In `Kanban.svelte`, review cards show a compact chip row: one chip per gate with ✓ (green) or ✗ (red, or yellow for a failed optional gate) and the gate name.
- When any required gate failed, the card shows an `Open log` link that sends `postMessage('openExecutionLog', { specId })`. `KanbanPanel` opens the latest `.sdd/executions/<specId>/exec-NNN.log` in an editor.

### Non-Functional
- The chips wrap on narrow columns and use theme variables only.

## Acceptance Criteria
### Automated
- [ ] `npm run build:webview` succeeds.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] A review card for a run with a failing test shows `✗ tests`, and `Open log` opens the execution log.
- [ ] Cards with no gate data look exactly as before.

## Constraints
- Do not send full gate output to the webview.
- Do not change other columns.

---
spec_id: SDD-091-NEW
title: Show scope violations on review cards and confirm before approving
status: draft
priority: high
complexity: medium
tags: [feature, phase-3, ui, rel-v2.0]
relevant_files:
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/lib/types.ts
  - webview-ui/src/kanban/Kanban.svelte
  - src/commands/reviewCommands.ts
must_not_touch:
  - src/extension.ts
  - src/execution/resultCapture.ts
  - webview-ui/src/lib/vscode.ts
depends_on: [SDD-090-NEW, SDD-087-NEW]
agent_skills: frontend
created: 2026-10-15
---

## Context
SDD-090 stores `scopeViolations` in each execution record. Builders, especially those who don't read diffs, must see immediately when the AI touched files it was not allowed to, and must not be able to approve such a spec by accident.

`KanbanPanel.loadSpecs()` already injects `changedFiles` from `getLatestExecution(specId)` for review specs; this spec adds `scopeViolations` the same way.

## Requirements
### Functional
- Add `scopeViolations?: { path: string; status: string; reason: 'must_not_touch' | 'outside_relevant_files' }[]` to `SpecSummary` in `webview-ui/src/lib/types.ts`.
- In `KanbanPanel.loadSpecs()`, inject `scopeViolations` from the latest execution record for review specs.
- In `Kanban.svelte`, on review cards:
  - Show a badge `⚠ N out of scope` when violations exist, using `--vscode-errorForeground` for `must_not_touch` violations and `--vscode-editorWarning-foreground` when all violations are `outside_relevant_files`.
  - In the expanded changed-files list, mark each violating file with its reason.
- Approve gate: in `createApproveSpecCommand` (`src/commands/reviewCommands.ts`), if the latest record has `must_not_touch` violations, replace the normal confirmation with the modal warning `<specId> modified protected files: <list>. Approve anyway?` and the actions `Approve Anyway` and `Discard changes`. `Discard changes` calls `discardExecutionChanges` from SDD-086. With only `outside_relevant_files` violations, append the file list to the normal confirmation text.

### Non-Functional
- The badge must be readable in light, dark and high-contrast themes.

## Acceptance Criteria
### Automated
- [ ] A test for the approve command covers: no violations (normal confirm), `must_not_touch` violations (modal with Approve Anyway), and only `outside_relevant_files` (list appended).
- [ ] `npm run build:webview` succeeds.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] A review card for a run that edited a protected file shows a red badge, and approving shows the protected-file warning.

## Constraints
- Do not auto-revert files.
- Keep the existing card layout; add the badge next to the changed-files toggle.

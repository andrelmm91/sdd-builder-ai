---
spec_id: SDD-054
title: Wire bulk execution to commands and kanban panel
status: draft
priority: medium
complexity: medium
tags: [phase-2, backend, ai-config]
relevant_files:
  - src/commands/executeSpec.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/extension.ts
must_not_touch: []
depends_on: [SDD-052, SDD-053]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-08
---

## Context

With the bulk execution queue manager (SDD-053) and config-aware execution (SDD-052) in place, this spec wires everything together. The KanbanPanel needs to handle bulk-related messages from the webview (add to bulk, remove from bulk, execute all), and the executeSpec command's logic needs to be callable from the bulk manager. New commands are registered in extension.ts.

## Requirements

### Functional
- Extract the core execution logic from `executeSpec.ts` into a reusable `executeSingleSpec(specId: string): Promise<boolean>` function that can be called by both the direct Execute button and the bulk queue manager
- In `KanbanPanel.ts`, handle new message types from the webview:
  - `addToBulk` (specId) → call `BulkExecutionManager.getInstance().addSpec(specId)`
  - `removeFromBulk` (specId) → call `BulkExecutionManager.getInstance().removeSpec(specId)`
  - `executeAll` → call `BulkExecutionManager.getInstance().executeAll(executeSingleSpec)`, post state updates to webview
  - `requestBulkState` → post current queue state to webview
- Subscribe to `BulkExecutionManager.onStateChange` in KanbanPanel to push state updates to the webview via `post('bulkState', state)`
- Register `sdd.addToBulk` and `sdd.executeAllBulk` commands in extension.ts

### Non-Functional
- During bulk execution, individual spec progress should still show in VS Code progress notification
- Bulk execution must be cancellable (cancel stops after current spec finishes)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation succeeds
- [ ] Extension builds without errors

### Manual
- [ ] Adding a spec to bulk via kanban message works
- [ ] Execute All runs specs sequentially
- [ ] Bulk state updates are pushed to the webview in real-time
- [ ] Cancelling bulk execution stops after current spec

## Constraints
- Minimize changes to executeSpec.ts — extract, don't rewrite
- Do not modify the bulk execution UI (Kanban.svelte) — that's SDD-055
- Preserve existing single-spec execution behavior

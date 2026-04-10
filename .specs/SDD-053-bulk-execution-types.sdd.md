---
spec_id: SDD-053
title: Define bulk execution types and queue manager
status: done
priority: medium
complexity: medium
tags: [phase-2, backend, ai-config]
relevant_files:
  - src/execution/bulkExecution.ts
  - src/execution/types.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-047]
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The AI Configuration feature includes bulk sequential execution — the ability to queue multiple Ready specs and execute them one after another. This spec defines the types and core queue management logic for bulk execution, independent of the UI. It manages the ordered queue of spec IDs, tracks which spec is currently executing, and provides methods to add/remove specs and advance through the queue.

## Requirements

### Functional
- Define `BulkExecutionItem` interface with: `specId` (string), `status` ('queued' | 'executing' | 'completed' | 'failed')
- Define `BulkExecutionState` interface with: `items` (BulkExecutionItem[]), `isRunning` (boolean), `currentIndex` (number)
- Implement `BulkExecutionManager` class with:
  - `addSpec(specId: string)` — add spec to queue (only if status is 'ready', checked via spec parser)
  - `removeSpec(specId: string)` — remove spec from queue (only if not currently executing)
  - `getQueue()` — return current BulkExecutionState
  - `isInBulk(specId: string)` — check if spec is in the queue
  - `clear()` — clear the entire queue (only if not running)
  - `async executeAll(executeFn: (specId: string) => Promise<boolean>)` — sequentially execute each queued spec using the provided function, updating item statuses as execution progresses; returns when all complete or one fails
  - Event emitter for state changes (`onStateChange` event) so UI can react
- `BulkExecutionManager` should be a singleton (one bulk queue per workspace)

### Non-Functional
- Queue state is in-memory only (not persisted to disk) — bulk execution is a session concept
- Must be safe for sequential async execution (no race conditions)

## Acceptance Criteria

### Automated
- [ ] Unit tests pass for addSpec, removeSpec, isInBulk, clear
- [ ] Unit tests pass for executeAll with mock executeFn (success and failure scenarios)
- [ ] State change events fire correctly during executeAll
- [ ] TypeScript compilation succeeds

### Manual
- [ ] Queue correctly prevents adding non-ready specs
- [ ] Queue correctly prevents removal of currently executing spec

## Constraints
- Do not modify executeSpec.ts — the `executeFn` callback will be wired in a later spec
- Do not add UI code — this is backend-only queue management
- Use VS Code `EventEmitter` for events

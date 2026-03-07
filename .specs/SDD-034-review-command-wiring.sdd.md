---
spec_id: SDD-034
title: Wire review commands to VS Code UI
status: done
priority: high
complexity: medium
tags: [phase-3, frontend]
relevant_files:
  - src/extension.ts
  - src/review/reviewManager.ts
  - package.json
must_not_touch:
  - src/execution/cliRunner.ts
depends_on: [SDD-031, SDD-032, SDD-033]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The review modules (manager, diff provider, feedback writer) are built. This spec wires them to VS Code commands so builders can open reviews, make decisions, and trigger re-execution from the command palette and sidebar context menu.

## Requirements

### Functional
- Register these commands in `extension.ts`:
  - `sdd.reviewSpec` — opens review split view (spec + diffs) for the selected spec
  - `sdd.approveSpec` — approves spec and triggers GitHub flow (SDD-035/036)
  - `sdd.requestChanges` — opens input box for feedback, saves feedback, transitions to ready
  - `sdd.rejectSpec` — confirms with user, reverts changes, transitions to draft
- Update `package.json`:
  - Add commands to `contributes.commands`
  - Add context menu entries: Review appears for "in_progress"/"review" specs, Approve/Request Changes/Reject appear for "review" specs
- After Request Changes: automatically trigger re-execution prompt ("Would you like to re-execute with this feedback?")

### Non-Functional
- Reject must show a confirmation dialog (destructive action — reverts code)
- All commands must refresh the sidebar tree after completion

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] Right-clicking a "review" spec shows Approve, Request Changes, Reject
- [ ] Review opens spec and diff side by side
- [ ] Request Changes prompts for feedback and re-execution
- [ ] Reject shows confirmation and reverts changes

## Constraints
- Must use ReviewManager, DiffProvider, and FeedbackWriter — do not duplicate logic
- Must use lifecycle module for status transitions

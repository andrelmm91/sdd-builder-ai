---
spec_id: SDD-031
title: Implement review manager and types
status: draft
priority: high
complexity: medium
tags: [phase-3, frontend]
relevant_files:
  - src/review/reviewManager.ts
  - src/review/types.ts
  - src/execution/types.ts
must_not_touch:
  - src/execution/cliRunner.ts
depends_on: [SDD-024, SDD-028]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

After execution, builders review AI-generated changes. The review manager opens a split view with the spec on the left and a multi-file diff on the right, and provides decision commands (Approve, Request Changes, Reject). This spec implements the review orchestration logic.

## Requirements

### Functional
- `src/review/types.ts` must export:
  - `ReviewDecision` type: `'approve' | 'request_changes' | 'reject'`
  - `ReviewRecord` interface: `{ specId: string; reviewNumber: number; timestamp: string; decision: ReviewDecision; feedback?: string; reviewer: string }`
- `src/review/reviewManager.ts` must export:
  - `ReviewManager` class with:
    - `openReview(specId: string): Promise<void>` — opens the review split view:
      - Left pane: spec `.sdd.md` file
      - Right pane: git diff of changed files (using VS Code's built-in diff view)
    - `submitDecision(specId: string, decision: ReviewDecision, feedback?: string): Promise<void>` — processes the review decision:
      - Approve: transition spec to "done" status
      - Request Changes: save feedback, transition spec to "ready" for re-execution
      - Reject: revert changes (`git checkout` the changed files), transition spec to "draft"
    - `getReviewHistory(specId: string): Promise<ReviewRecord[]>` — reads all reviews for a spec

### Non-Functional
- Review decision must be atomic — status change + feedback save in one operation
- Must handle concurrent review attempts (only one review per spec at a time)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: approve transitions spec to done
- [ ] Unit tests pass: request_changes transitions spec to ready and saves feedback
- [ ] Unit tests pass: reject transitions spec to draft

### Manual
- [ ] Opening review shows spec and diff side by side
- [ ] Decision buttons correctly update spec status

## Constraints
- Must use the lifecycle module for all status transitions
- Must use VS Code diff API for showing changes
- Reject action uses `git checkout` — warn user that changes will be lost

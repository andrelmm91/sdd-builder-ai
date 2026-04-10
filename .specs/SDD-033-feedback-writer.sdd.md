---
spec_id: SDD-033
title: Implement review feedback writer and re-execution loop
status: done
priority: medium
complexity: low
tags: [phase-3, backend]
relevant_files:
  - src/review/feedbackWriter.ts
  - src/review/types.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/review/reviewManager.ts
  - src/execution/cliRunner.ts
depends_on: [SDD-031, SDD-003]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

When a builder requests changes during review, they write feedback explaining what needs to be fixed. This feedback is saved to `.sdd/reviews/{spec_id}/review-{NNN}.md` and injected into the next execution context so the AI agent can see what went wrong and correct it.

## Requirements

### Functional
- `src/review/feedbackWriter.ts` must export:
  - `saveFeedback(specId: string, review: ReviewRecord): Promise<string>` — writes feedback to `.sdd/reviews/{specId}/review-{NNN}.md`, returns the file path
  - Feedback file format: markdown with review decision, timestamp, and feedback text
  - `loadLatestFeedback(specId: string): Promise<string | undefined>` — reads the most recent feedback for a spec
  - `getReviewNumber(specId: string): Promise<number>` — determines next review number by counting existing review files
- Review files must be human-readable markdown

### Non-Functional
- Must create review directories if they don't exist

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: feedback is saved with correct file path and numbering
- [ ] Unit tests pass: loadLatestFeedback returns the most recent feedback

### Manual
- [ ] Feedback files appear in `.sdd/reviews/` with readable content

## Constraints
- Must use fileSystem utility for all file operations
- Do not interact with the execution engine — the review manager coordinates re-execution

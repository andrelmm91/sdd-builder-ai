---
spec_id: SDD-037
title: Wire approve and ship-to-GitHub command
status: done
priority: high
complexity: medium
tags: [phase-3, frontend]
relevant_files:
  - src/extension.ts
  - src/github/gitOps.ts
  - src/github/prCreator.ts
must_not_touch:
  - src/review/reviewManager.ts
depends_on: [SDD-034, SDD-035, SDD-036]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The "Approve & Create PR" flow ties together review approval, Git operations, and PR creation into a single command. When a builder approves a spec, the extension automatically creates a branch, commits changes, pushes, and opens a PR on GitHub.

## Requirements

### Functional
- Update `sdd.approveSpec` command in `extension.ts` to orchestrate the full ship flow:
  1. Confirm with user: "Approve SPEC-XXX and create a PR?"
  2. Transition spec to "done" via lifecycle
  3. Create branch via gitOps: `sdd/{spec_id}-{slug}`
  4. Stage changed files via gitOps
  5. Commit with spec-derived message
  6. Push to remote
  7. Create PR via prCreator
  8. Save PR URL to execution record
  9. Show notification with PR link: "PR created: {url}"
- Handle failures at each step:
  - Git failure → show error, keep spec in "review" status
  - Push failure → show error, offer to retry
  - PR creation failure (no gh CLI) → show warning, changes are committed locally
- Show progress during the multi-step flow

### Non-Functional
- Must handle the case where the user has uncommitted changes (warn before proceeding)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] Approving a spec creates branch, commits, pushes, and opens PR
- [ ] PR URL is shown in notification and saved to execution record
- [ ] Failures at any step show appropriate error messages

## Constraints
- Must use gitOps and prCreator modules — do not duplicate Git/GitHub logic
- Must confirm with user before proceeding (destructive: pushes code)

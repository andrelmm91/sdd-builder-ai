---
spec_id: SDD-101-TECHDEBT
title: Update README, HOW-TO and planner skill for the reliability features
status: review
priority: low
complexity: low
tags:
  - techdebt
  - phase-6
  - docs
  - rel-v2.0
relevant_files:
  - README.md
  - HOW-TO.md
  - resources/skills/sdd-planner/SKILL.md
  - CHANGELOG.md
must_not_touch:
  - src/extension.ts
  - package.json
depends_on:
  - SDD-087-NEW
  - SDD-088-NEW
  - SDD-094-NEW
  - SDD-104-NEW
  - SDD-095-NEW
  - SDD-098-NEW
  - SDD-099-NEW
  - SDD-100-TECHDEBT
agent_skills: docs
created: 2026-10-15
---

## Context
Update Readme, HOW-TO and planner skill for the reliability features implemented in rel-v2.0, including the "Safety net" section, "Bring Your Own AI" section, and the `SDD: Run Doctor` command.

## Requirements
### Functional
- `README.md`:
  - Add a "Safety net" section covering git checkpoints, the Discard AI Changes command and button, and recovery of stale in-progress specs. Explain that Reject discards the AI's changes, while Request Changes keeps them so the next run builds on them, and a later Reject still discards every attempt.
  - "Bring Your Own AI": document creating custom providers from the "Custom Providers" section of AI Configuration (with live validation and command preview), show the resulting `customProviders` JSON as one example, user-defined model lists edited from the "Model Lists" section of AI Configuration and stored in `ai.models` (which replace the built-in suggestions per provider), and running one spec with a different model from the Kanban Execute button's ▾ menu (SDD-095).
  - Mention the `SDD: Run Doctor` command in getting started.
  - Note that git is required for change tracking and discard.
- `HOW-TO.md`: add step-by-step guides for adding a custom provider through the AI Configuration editor and for discarding an execution.
- `resources/skills/sdd-planner/SKILL.md`: fix the inconsistency between "Maximum 4 files" and "Do not create specs that modify more than 3 files" by standardizing on 4.
- `CHANGELOG.md`: check release 2.0.0 description and make sure it is user friendly.

### Non-Functional
- Plain, beginner-friendly language; no claims beyond implemented behavior.

## Acceptance Criteria
### Automated
- [x] `npm test` passes (no code changes expected).

### Manual
- [ ] Every feature described in the README can be found in the extension.
- [ ] The custom provider example in the README matches the schema implemented in SDD-091.

## Constraints
- Do not edit `.sdd/skills/sdd-planner/SKILL.md` in this repo; that is the workspace copy, and `resources/` is the shipped template.
- Do not change code.

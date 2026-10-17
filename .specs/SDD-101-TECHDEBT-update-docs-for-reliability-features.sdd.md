---
spec_id: SDD-106-TECHDEBT
title: Update README, HOW-TO and planner skill for the reliability features
status: draft
priority: low
complexity: low
tags: [techdebt, phase-6, docs, rel-v2.0]
relevant_files:
  - README.md
  - HOW-TO.md
  - resources/skills/sdd-planner/SKILL.md
  - CHANGELOG.md
must_not_touch:
  - src/extension.ts
  - package.json
depends_on: [SDD-087-NEW, SDD-092-NEW, SDD-093-NEW, SDD-099-NEW, SDD-100-NEW, SDD-103-NEW, SDD-104-NEW, SDD-105-TECHDEBT]
agent_skills: docs
created: 2026-10-15
---

## Context
SDD-078 to SDD-105 change how execution, review and configuration behave. Parts of the README currently promise behavior that was not enforced before these specs (for example "AI that respects your architecture"), and the planner skill does not know about the new `verify`, `provider`, `model` and `timeout_minutes` frontmatter fields. The documentation must describe the product as it now works.

## Requirements
### Functional
- `README.md`:
  - Add a "Safety net" section covering git checkpoints, the Discard AI Changes command and button, and recovery of stale in-progress specs. Explain that Reject discards the AI's changes, while Request Changes keeps them so the next run builds on them, and a later Reject still discards every attempt.
  - Add a "Quality gates" section covering the `gates` config, the spec `verify` field, results on review cards, and `autoRetryMax`.
  - "Bring Your Own AI": document `customProviders` with one example, user-defined model lists edited from the "Model Lists" section of AI Configuration and stored in `ai.models` (which replace the built-in suggestions per provider), and per-spec `provider`/`model` overrides.
  - Mention the `SDD: Run Doctor` command in getting started.
  - Note that git is required for change tracking and discard.
- `HOW-TO.md`: add step-by-step guides for configuring gates, adding a custom provider, and discarding an execution.
- `resources/skills/sdd-planner/SKILL.md`: add `verify`, `provider`, `model` and `timeout_minutes` to the frontmatter reference table as optional fields, and instruct the planner to always emit `verify` commands for automated criteria. Also fix the inconsistency between "Maximum 4 files" and "Do not create specs that modify more than 3 files" by standardizing on 4.
- `CHANGELOG.md`: add an "Unreleased" entry summarizing the changes.

### Non-Functional
- Plain, beginner-friendly language; no claims beyond implemented behavior.

## Acceptance Criteria
### Automated
- [ ] `npm test` passes (no code changes expected).
- [ ] `grep -n "verify" resources/skills/sdd-planner/SKILL.md` returns at least one match in the frontmatter reference table.

### Manual
- [ ] Every feature described in the README can be found in the extension.
- [ ] The custom provider example in the README matches the schema implemented in SDD-096.

## Constraints
- Do not edit `.sdd/skills/sdd-planner/SKILL.md` in this repo; that is the workspace copy, and `resources/` is the shipped template.
- Do not change code.

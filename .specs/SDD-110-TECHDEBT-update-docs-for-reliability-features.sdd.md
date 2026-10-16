---
spec_id: SDD-110-TECHDEBT
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
depends_on: [SDD-087-NEW, SDD-091-NEW, SDD-096-NEW, SDD-097-NEW, SDD-103-NEW, SDD-104-NEW, SDD-107-NEW, SDD-108-NEW, SDD-109-TECHDEBT]
agent_skills: docs
created: 2026-10-15
---

## Context
SDD-078 to SDD-109 change how execution, review and configuration behave. Parts of the README currently promise behavior that was not enforced before these specs (for example "AI that respects your architecture"), and the planner skill does not know about the new `verify`, `provider`, `model` and `timeout_minutes` frontmatter fields. The documentation must describe the product as it now works.

## Requirements
### Functional
- `README.md`:
  - "Scoped Execution": describe glob support in `must_not_touch` and `relevant_files`, post-run scope analysis, violation badges and the approve warning.
  - Add a "Safety net" section covering git checkpoints, the Discard AI Changes command and button, and recovery of stale in-progress specs.
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
- [ ] The custom provider example in the README matches the schema implemented in SDD-100.

## Constraints
- Do not edit `.sdd/skills/sdd-planner/SKILL.md` in this repo; that is the workspace copy, and `resources/` is the shipped template.
- Do not change code.

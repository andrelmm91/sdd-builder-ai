---
spec_id: SDD-015
title: Add context menu actions and lifecycle commands
status: done
priority: medium
complexity: medium
tags: [phase-1, frontend]
relevant_files:
  - src/extension.ts
  - package.json
  - src/specs/lifecycle.ts
must_not_touch:
  - src/views/sidebar/specTreeProvider.ts
  - src/specs/parser.ts
depends_on: [SDD-007, SDD-014]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

Builders interact with specs through right-click context menus in the sidebar tree. This spec implements the commands for spec lifecycle transitions (Mark Ready, Execute, Review, etc.) and registers them as context menu items that appear based on the spec's current status.

## Requirements

### Functional
- Register these commands in `extension.ts`:
  - `sdd.markReady` — transitions spec from draft to ready (validates first)
  - `sdd.newSpec` — opens Quick Pick for template type, generates spec, opens in editor
  - `sdd.validateSpec` — runs validator on current spec, shows results
- Each command must:
  - Read the spec file, parse it, check current status
  - Use the lifecycle state machine to validate the transition
  - Update the `status` field in the YAML frontmatter
  - Save the file
  - Refresh the sidebar tree
  - Show success/error notification
- `package.json` must add `menus` contributions:
  - `view/item/context` entries for each command, with `when` clauses based on `viewItem` (the context value set in SpecTreeItem)
  - Example: "Mark Ready" only appears when `viewItem == 'draft'`

### Non-Functional
- Commands must validate before transitioning — show errors if validation fails
- Status changes must be atomic (read-modify-write with no race conditions)

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: Mark Ready command validates before transitioning

### Manual
- [ ] Right-clicking a draft spec shows "Mark Ready" in context menu
- [ ] Right-clicking a ready spec shows "Execute" (will be wired in Phase 2)
- [ ] Status changes are reflected immediately in the sidebar tree

## Constraints
- Must use the lifecycle module (SDD-007) for all status transitions
- Must use the validator (SDD-005) before marking specs as ready
- Execute and Review commands are registered but show "Coming soon" notifications — implemented in Phase 2 and 3

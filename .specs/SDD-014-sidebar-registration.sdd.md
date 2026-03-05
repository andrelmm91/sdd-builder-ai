---
spec_id: SDD-014
title: Register sidebar views and wire tree providers in extension
status: draft
priority: high
complexity: low
tags: [phase-1, frontend]
relevant_files:
  - src/extension.ts
  - src/views/sidebar/specTreeProvider.ts
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: [SDD-013]
budget_max_tokens: 50000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The tree providers (SDD-013) exist but aren't wired into the extension yet. This spec registers the sidebar views in `extension.ts`, connects the `SpecTreeProvider` to the `sdd.specTree` view declared in `package.json`, and adds a refresh command.

## Requirements

### Functional
- In `extension.ts` `activate()`:
  - Create `SpecTreeProvider` instance
  - Register it with `vscode.window.registerTreeDataProvider('sdd.specTree', provider)`
  - Register `sdd.refreshSpecs` command that calls `provider.refresh()`
- Add `sdd.refreshSpecs` command to `package.json` contributes.commands with title "SDD: Refresh Specs"
- Add a refresh button (inline icon) to the Specs view title bar using `view/title` menu contribution in `package.json`

### Non-Functional
- Provider disposal must be added to extension subscriptions for cleanup

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] SDD icon appears in the Activity Bar
- [ ] Clicking SDD icon shows the Specs tree view
- [ ] Refresh button in the view title bar triggers a refresh

## Constraints
- Only modify extension.ts and package.json — do not modify tree provider code

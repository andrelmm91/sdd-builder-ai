---
spec_id: SDD-088-NEW
title: Ask before moving interactive runs with no changes to review
status: ready
priority: medium
complexity: low
tags:
  - feature
  - phase-4
  - backend
  - rel-v2.0
relevant_files:
  - src/commands/executeSpec.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/resultCapture.ts
depends_on:
  - SDD-084-NEW
agent_skills: backend
created: 2026-10-15
---

## Context
In interactive modes (Claude `default`/`plan`, Copilot `default`), `CliRunner` treats closing the terminal as success. A session the builder abandoned, or one where the AI crashed or only asked questions, still moves the spec to `review`, which looks like finished work.

With accurate change capture from SDD-084, SDD can tell whether anything actually changed.

## Requirements
### Functional
- In the interactive success path of `executeSingleSpec()`, after `captureResults`, if `capture.changedFiles` is empty (ignoring changes to the spec file itself and to `.sdd/`), show the modal warning `No file changes were detected for <specId>. What would you like to do?` with actions `Send to Review` and `Back to Ready`.
  - `Send to Review`: the current behavior.
  - `Back to Ready`, or dismissing the dialog: patch the execution record `status` to `aborted`, set the spec to `ready`, and return `false`.
- The non-interactive path is unchanged.

### Non-Functional
- No extra git commands; reuse the `changedFiles` already computed.

## Acceptance Criteria
### Automated
- [ ] `src/commands/executeSpec.test.ts` covers, in interactive mode: changes detected (no prompt, status `review`), no changes plus `Send to Review`, no changes plus `Back to Ready`, and only spec-file changes (treated as no changes).
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Start an interactive execution, close the terminal immediately, and confirm the prompt appears and `Back to Ready` returns the card to Ready.

## Constraints
- Do not change how the terminal close is detected.

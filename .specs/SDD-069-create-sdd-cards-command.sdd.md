---
spec_id: SDD-069
title: Implement create SDD cards command
status: draft
priority: high
complexity: high
tags: [phase-2, backend, ai]
relevant_files:
  - src/execution/cliRunner.ts
  - src/views/webviews/requirementBoard/featureParser.ts
  - src/utils/constants.ts
must_not_touch:
  - src/commands/executeSpec.ts
depends_on: [SDD-064]
budget_max_tokens: 150000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

When a user clicks "Create SDD Cards" on an Idealization In Review card, the extension must invoke the AI CLI to generate SDD spec files in `.specs/` based on the idealization document. This spec implements the `sdd.createSddCards` VS Code command that orchestrates the AI call using the SDD Planner skill and post-validates the output.

This is the final step of the idealization pipeline — it bridges the requirement board to the existing SDD kanban board by generating spec files.

## Requirements

### Functional
- Create `src/commands/createSddCards.ts` exporting a function that registers the `sdd.createSddCards` command
- The command receives `featureName: string` and `folderPath: string` as arguments
- Show a progress notification (`vscode.window.withProgress`) during AI execution with the message "Creating SDD cards for {featureName}..."
- Construct the AI CLI prompt:
  ```
  Create new phases and SDDs in @.specs/ to fulfill the requirements
  in @{.sdd/product/{feature_name}/idealization.md} by using skills
  in @.claude/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed.
  ```
- Invoke the AI CLI using the existing `CliRunner` or by spawning a process following the `cliRunner.ts` pattern
- After AI completion, perform post-validation:
  - Verify at least one new `.sdd.md` file was created in `.specs/` (compare file list before and after)
  - Update `idealization.md` status to `"SDD Created"` with current date using `updateFeatureStatus`
  - Update `{feature_name}.md` status to `"SDD Created"` with current date using `updateFeatureStatus`
- Show success notification on completion with count of new specs created, or error message on failure
- Handle timeouts and AI CLI failures gracefully with user-visible error messages

### Non-Functional
- The command must be cancellable via the progress notification cancel button
- Reuse existing CLI runner infrastructure
- Snapshot the `.specs/` directory listing before the AI call to detect new files afterward

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Extension builds successfully (`npm run build`)

### Manual
- [ ] Progress notification appears during AI execution
- [ ] After successful execution, new `.sdd.md` files exist in `.specs/`
- [ ] `idealization.md` and `{feature_name}.md` statuses are both updated to "SDD Created"
- [ ] Success notification shows the count of newly created spec files
- [ ] Error message appears if AI CLI fails or no specs are generated

## Constraints
- Do not modify `cliRunner.ts` — use it as-is or follow its patterns
- Do not modify existing spec files in `.specs/` — only create new ones
- The prompt must use the `@` file reference syntax and reference the SDD Planner skill
- Do not implement the AI CLI prompt logic inside the panel — this must be a standalone command

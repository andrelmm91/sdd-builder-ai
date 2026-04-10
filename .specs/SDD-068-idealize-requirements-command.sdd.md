---
spec_id: SDD-068
title: Implement idealize requirements command
status: done
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
agent_skills: backend-dev
created: 2026-03-09
---

## Context

When a user clicks "Idealize Requirements" on a Feature Backlog card, the extension must invoke the AI CLI to generate a structured idealization document. This spec implements the `sdd.idealizeRequirements` VS Code command that orchestrates the AI call and post-validates the output.

The command uses the existing `cliRunner.ts` pattern to spawn the AI CLI process with a prompt that references the feature file. After the AI completes, the command validates and fixes the output to ensure the idealization file exists with correct frontmatter.

## Requirements

### Functional
- Create `src/commands/idealizeRequirements.ts` exporting a function that registers the `sdd.idealizeRequirements` command
- The command receives `featureName: string` and `folderPath: string` as arguments
- Show a progress notification (`vscode.window.withProgress`) during AI execution with the message "Idealizing requirements for {featureName}..."
- Construct the AI CLI prompt:
  ```
  Based on the following feature description, acceptance criteria and notes
  in @{.sdd/product/{feature_name}/{feature_name}.md}, create a new markdown file
  (named idealization.md) in the same folder with a concise idealization of this feature.
  Make sure to include all the important information and recommendations.
  The idealization should be clear and easy to understand for the development team.
  ```
- Invoke the AI CLI using the existing `CliRunner` or by spawning a process following the `cliRunner.ts` pattern
- After AI completion, perform post-validation:
  - Verify `idealization.md` exists in the feature folder. If the AI created a differently-named file, rename it to `idealization.md`
  - Ensure YAML frontmatter has `status: "Idealization In Review"` and `date: {today}`. Add or fix if missing using `serializeFrontmatter`
  - Update the original `{feature_name}.md` status to `"Idealization In Review"` with current date using `updateFeatureStatus`
- Show success notification on completion, or error message on failure
- Handle timeouts and AI CLI failures gracefully with user-visible error messages

### Non-Functional
- The command must be cancellable via the progress notification cancel button
- Reuse existing CLI runner infrastructure — do not create a new process spawning mechanism

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes (`npm run type-check`)
- [x] Extension builds successfully (`npm run build`)

### Manual
- [ ] Progress notification appears during AI execution
- [ ] After successful execution, `idealization.md` exists with correct frontmatter
- [ ] Original feature file status is updated to "Idealization In Review"
- [ ] Error message appears if AI CLI fails or times out

## Constraints
- Do not modify `cliRunner.ts` — use it as-is or follow its patterns
- Do not handle SDD generation in this command — that is a separate command (SDD-069)
- The prompt must reference the feature file using the `@` file reference syntax expected by the AI CLI

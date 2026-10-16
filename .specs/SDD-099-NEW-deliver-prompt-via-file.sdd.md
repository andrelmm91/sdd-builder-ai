---
spec_id: SDD-099-NEW
title: Deliver the execution prompt to the CLI through an instructions file
status: draft
priority: high
complexity: medium
tags: [feature, phase-5, backend, rel-v2.0]
relevant_files:
  - src/execution/cliRunner.ts
  - src/execution/contextAssembler.ts
  - src/commands/executeSpec.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliCommandBuilder.ts
depends_on: [SDD-098-TECHDEBT, SDD-079-BUGFIX]
agent_skills: backend
created: 2026-10-15
---

## Context
`CliRunner._buildCommand()` packs the whole prompt into a single shell argument and flattens newlines into spaces to avoid shell continuation prompts. This is fragile (quoting differs per shell and length limits apply) and loses structure. With `buildExecutionPrompt()` from SDD-098, SDD can write a full Markdown instructions document to disk and pass the CLI one short, quote-safe instruction that references it.

## Requirements
### Functional
- Before launching the terminal, `CliRunner.execute()` builds the document with `buildExecutionPrompt()` and writes it to `.sdd/executions/<specId>/prompt-<timestamp>.md`, creating the folder if needed.
- The CLI prompt argument becomes `Read and follow all instructions in <fileRef of the prompt file>.` Here `fileRef` uses the provider's format (`@path` for Claude, `#file:path` for Copilot).
- Pre-prompt, skill paths, post-execution commands and any `extraPrompt` (SDD-095, if present) move into the document and are removed from the inline argument.
- Keep the prompt file after the run (it is part of the audit trail), and add its relative path as an optional `promptFile` field on the result so `captureResults` can store it in the record. If `ExecutionResult` needs a new field, add it as optional.
- Read the VS Code setting `sdd.inlineRelevantFiles` (boolean, default `false`) via `vscode.workspace.getConfiguration('sdd')` and pass it through as `inlineFileContents`. Declaring the setting in `package.json` is left to SDD-109.

### Non-Functional
- The inline CLI argument must contain no characters that need escaping beyond the file path.
- Cross-platform: the file path uses forward slashes.

## Acceptance Criteria
### Automated
- [ ] `src/execution/cliRunner.test.ts` asserts that the prompt file is written with the expected sections, that the generated command contains only the short instruction and the file reference for both providers, and that pre-prompt text no longer appears inline.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Executing a spec on Windows and on macOS/Linux starts the CLI, which reads the prompt file and implements the spec.
- [ ] The prompt file is present under `.sdd/executions/<specId>/` after the run.

## Constraints
- Do not change the requirements AI flow (`cliCommandBuilder.ts`, idealize and create-cards commands).
- Do not change terminal launch mechanics.

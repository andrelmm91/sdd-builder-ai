---
spec_id: SDD-098-TECHDEBT
title: Refactor contextAssembler into the execution prompt document builder
status: draft
priority: medium
complexity: medium
tags: [techdebt, phase-5, backend, rel-v2.0]
relevant_files:
  - src/execution/contextAssembler.ts
  - src/execution/skillsLoader.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-082-BUGFIX]
agent_skills: backend
created: 2026-10-15
---

## Context
`assembleExecutionContext()` in `src/execution/contextAssembler.ts` is never called in production. The real prompt built in `CliRunner._buildCommand()` is a single line, `Implement @<spec file>` plus skill paths and post-execution commands. So `conventions.md` and the scope rules reach the AI only if it chooses to read them, which the README overstates.

This spec reshapes the assembler into a builder for the execution instructions document that SDD-099 will hand to the CLI as a file. It also fixes the UTF-8-unsafe truncation (`Buffer.slice` can cut a multi-byte character in half). No behavior changes until SDD-099 wires it in.

## Requirements
### Functional
- Rename the main export to `buildExecutionPrompt(spec, options): Promise<string>`, keeping `assembleExecutionContext` as a deprecated alias for one release.
- Extend `ContextOptions` with:
  - `specFileRef: string`: the provider-specific reference to the spec file (for example `@.specs/X.sdd.md`).
  - `skillPaths?: string[]`: resolved skill file paths (replacing raw skill content).
  - `inlineFileContents?: boolean`, default `false`. When false, `## Relevant Files` lists paths only and tells the agent to read them. When true, it keeps today's behavior of inlining contents.
  - `extraInstructions?: string`: appended as `## Additional Instructions` (used for retry feedback).
- The document order must be: Instructions (pre-prompt with `{spec_file}` replaced by `specFileRef`), Spec reference (do not inline the spec body when `specFileRef` is given; tell the agent to read it), Relevant Files, Conventions, Agent Skills (paths), Scope Constraints (must list `must_not_touch` and state that SDD verifies scope after the run), Post-Execution Commands, Previous Feedback, Additional Instructions.
- Replace byte truncation with a UTF-8-safe truncation that never splits a character and appends `\n\n[truncated by SDD]`.

### Non-Functional
- A pure function apart from reading the conventions file and relevant files (when inlining).

## Acceptance Criteria
### Automated
- [ ] `src/execution/contextAssembler.test.ts` is updated for the new section order, path-only relevant files by default, the inline option, skill paths, extra instructions, and a truncation test with multi-byte characters (for example emoji) at the boundary that produces valid UTF-8.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

## Constraints
- Do not call the builder from `cliRunner.ts` or `executeSpec.ts` (SDD-099).
- Do not change the default pre-prompt text.

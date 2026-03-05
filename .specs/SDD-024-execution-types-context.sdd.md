---
spec_id: SDD-024
title: Define execution types and implement context assembler
status: draft
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/execution/types.ts
  - src/execution/contextAssembler.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/planning/planContextAssembler.ts
depends_on: [SDD-002, SDD-003]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

When a spec is executed, the extension must assemble a comprehensive context document containing the spec itself, contents of all relevant files, project conventions, agent skills, and any previous feedback. This context is what gets passed to Claude CLI so the AI agent has everything needed to implement the spec.

## Requirements

### Functional
- `src/execution/types.ts` must export:
  - `ExecutionRecord` interface: `{ specId: string; executionNumber: number; timestamp: string; tokensIn: number; tokensOut: number; cost: number; status: 'running' | 'completed' | 'failed' | 'aborted'; duration: number; testsPassed: boolean | null; prUrl: string | null }`
  - `ExecutionConfig` interface: `{ maxTokens: number; claudeCliBinary: string; testCommand: string; autoValidate: boolean }`
  - `LogEvent` type: `{ timestamp: string; type: 'start' | 'output' | 'error' | 'end'; content: string }`
- `src/execution/contextAssembler.ts` must export:
  - `assembleExecutionContext(spec: SpecDocument, options: ContextOptions): Promise<string>` — builds the full execution context
  - `ContextOptions` type: `{ conventions?: string; skills?: string; feedback?: string; previousOutput?: string }`
  - Context document structure:
    1. **Spec** — full spec content (frontmatter + all sections)
    2. **Relevant Files** — contents of each file listed in `relevant_files` (with file path headers)
    3. **Conventions** — project conventions from `.sdd/conventions.md`
    4. **Agent Skills** — content from the skills file matching `agent_skills` field
    5. **Scope Constraints** — explicit instruction: "Only modify files listed in relevant_files. Do NOT modify: {must_not_touch files}"
    6. **Previous Feedback** — if re-executing after review feedback, include the feedback and previous output

### Non-Functional
- Must handle missing relevant files gracefully (include note: "File not found: {path}")
- Context must stay under 100KB to avoid token limit issues

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: context includes all sections when all inputs are provided
- [ ] Unit tests pass: missing relevant files produce "File not found" notes (not errors)
- [ ] Unit tests pass: feedback section is only included when feedback is provided

### Manual
- [ ] Context document provides sufficient information for Claude CLI to implement a spec

## Constraints
- Must use fileSystem utility for reading relevant files and conventions
- Do not invoke Claude CLI — this module only builds the context string

---
spec_id: SDD-019
title: Build planner context assembler
status: draft
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/planning/planContextAssembler.ts
  - src/planning/types.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/execution/contextAssembler.ts
depends_on: [SDD-003, SDD-018]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Before the SDD Planner agent can decompose requirements, it needs full project context. The plan context assembler gathers requirements text, repo file tree, existing specs, project conventions, and the spec format template, then combines them into a single context document that gets passed to Claude CLI alongside the sdd-planner skills file.

## Requirements

### Functional
- `src/planning/planContextAssembler.ts` must export:
  - `assemblePlanContext(request: PlanningRequest): Promise<string>` — builds the full context markdown document
  - The assembled context must include these sections:
    1. **Requirements** — the builder's requirements text
    2. **Project File Tree** — output of listing workspace files (excluding node_modules, .git, dist)
    3. **Existing Specs** — list of existing spec IDs with titles and statuses (so planner avoids duplication)
    4. **Project Conventions** — contents of `.sdd/conventions.md` (if exists)
    5. **Spec Format Reference** — the YAML frontmatter schema and markdown section structure
    6. **Instructions** — prefix to use for IDs, starting number (after existing specs)
  - If `request.feedback` is provided, include a **Refinement Feedback** section with the builder's iteration notes
- Must use fileSystem utility to read conventions and list existing specs

### Non-Functional
- Context document must be under 50KB to stay within reasonable token limits
- Must handle missing conventions file gracefully (skip that section)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes
- [ ] Unit tests pass: assembled context includes all required sections
- [ ] Unit tests pass: missing conventions file doesn't cause an error
- [ ] Unit tests pass: feedback section is included only when feedback is provided

### Manual
- [ ] Assembled context provides enough information for the planner agent to generate valid specs

## Constraints
- Do not invoke Claude CLI — this module only assembles the context string
- Must use fileSystem utility for all file reads

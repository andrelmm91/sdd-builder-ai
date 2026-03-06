---
spec_id: SDD-025
title: Implement agent skills file loader
status: draft
priority: medium
complexity: low
tags: [phase-2, backend]
relevant_files:
  - src/execution/skillsLoader.ts
  - src/utils/fileSystem.ts
  - src/utils/constants.ts
must_not_touch:
  - src/execution/contextAssembler.ts
depends_on: [SDD-003]
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Each spec references an `agent_skills` value (e.g., "backend-dev", "frontend-dev", "sdd-planner") that maps to a skills markdown file. The skills loader resolves the skills name to a file path, reads the file content, and returns it for injection into the execution context. It searches both `.sdd/skills/` and `.claude/skills/` directories.

## Requirements

### Functional
- `src/execution/skillsLoader.ts` must export:
  - `loadSkills(skillsName: string): Promise<string | undefined>` — reads the skills file content
  - Search order:
    1. `.sdd/skills/{skillsName}/SKILL.md`
    2. `.sdd/skills/{skillsName}.md`
    3. `.claude/skills/{skillsName}/SKILL.md`
    4. `.claude/skills/{skillsName}.md`
  - Returns `undefined` if no skills file is found
  - `listAvailableSkills(): Promise<string[]>` — returns names of all available skills files
  - `getSkillsPath(skillsName: string): Promise<string | undefined>` — returns the resolved file path without reading content

### Non-Functional
- Must handle missing skills files gracefully — return undefined, don't throw

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: skills file found in .sdd/skills/ is loaded correctly
- [x] Unit tests pass: fallback to .claude/skills/ works
- [x] Unit tests pass: missing skills returns undefined

### Manual
- [ ] Skills loader correctly finds the sdd-planner skills file in the project

## Constraints
- Must use fileSystem utility for all file reads
- Read-only — do not create or modify skills files

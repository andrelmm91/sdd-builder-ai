---
spec_id: SDD-012
title: Implement project initialization command
status: done
priority: high
complexity: medium
tags: [phase-0, frontend]
relevant_files:
  - src/extension.ts
  - src/config/projectConfig.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: [SDD-001, SDD-010, SDD-003]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

"SDD: Initialize Project" is the first command a builder runs. It creates the `.sdd/` folder structure, `.specs/` directory, a default conventions file, a default config file, and an example spec. It also runs a health check to verify Claude CLI, gh CLI, and Git are available. This spec wires the command registration in `extension.ts` and implements the init logic.

## Requirements

### Functional
- Register `sdd.initProject` command in `extension.ts` `activate()` function
- When invoked, the command must:
  - Check if `.sdd/config.json` already exists — if so, ask the user whether to reinitialize
  - Create directory structure: `.specs/`, `.sdd/`, `.sdd/executions/`, `.sdd/reviews/`, `.sdd/skills/`
  - Write `.sdd/config.json` with default project config
  - Write `.sdd/conventions.md` with a template containing sections: Code Style, File Structure, Testing, Error Handling (with placeholder guidance)
  - Write `.sdd/skills/sdd-planner/SKILL.md` as a placeholder (or copy from extension bundled assets)
  - Run health checks and display results:
    - `git --version` → Git available
    - `claude --version` (or configured binary) → Claude CLI available
    - `gh --version` → GitHub CLI available
  - Show VS Code information message with results: "SDD project initialized. Health: Git ✓, Claude CLI ✓, gh CLI ✗ (optional)"

### Non-Functional
- Must complete in under 5 seconds
- Must not overwrite existing files without user confirmation

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [x] Unit tests pass: init creates expected directory structure
- [x] Unit tests pass: health check correctly detects available/missing CLI tools

### Manual
- [ ] Running "SDD: Initialize Project" from command palette creates the full folder structure
- [ ] Health check results are displayed in an information message
- [ ] Re-running init on an already-initialized project prompts for confirmation

## Constraints
- Must use fileSystem utility for all file operations
- Must use shell utility for health checks
- Must use projectConfig for config file creation

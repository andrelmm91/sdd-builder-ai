---
spec_id: SDD-010
title: Create project config and extension settings management
status: draft
priority: high
complexity: medium
tags: [phase-0, backend]
relevant_files:
  - src/config/projectConfig.ts
  - src/config/extensionConfig.ts
  - src/utils/fileSystem.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-003]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

The SDD extension needs two layers of configuration: project-level config stored in `.sdd/config.json` (shared via Git) and user-level VS Code settings (per-user preferences). This spec implements readers/writers for both, providing a unified way to access configuration throughout the extension.

## Requirements

### Functional
- `src/config/projectConfig.ts` must export:
  - `ProjectConfig` interface: `{ prefix: string; testCommand: string; conventionsPath: string; skillsPath: string }`
  - `readProjectConfig(): Promise<ProjectConfig>` — reads `.sdd/config.json` from workspace, returns defaults if file doesn't exist
  - `writeProjectConfig(config: ProjectConfig): Promise<void>` — writes config to `.sdd/config.json`
  - `getDefaultProjectConfig(): ProjectConfig` — returns sensible defaults: prefix "SPEC", testCommand "npm test", conventionsPath ".sdd/conventions.md", skillsPath ".sdd/skills"
- `src/config/extensionConfig.ts` must export:
  - `getExtensionConfig()` — reads VS Code settings under `sdd.*` namespace
  - Typed accessors for each setting: `getSpecPrefix()`, `getTestCommand()`, `getClaudeCliBinary()`, `getDefaultBudget()`, `getAutoValidate()`
  - Settings fall back to project config values when VS Code settings are not set

### Non-Functional
- Config reads must be fast (cached where appropriate)
- Must handle missing or malformed config.json gracefully (use defaults)

## Acceptance Criteria

### Automated
- [ ] Unit tests pass: default config returns expected values
- [ ] Unit tests pass: reading a valid config.json returns correct values
- [ ] Unit tests pass: missing config.json falls back to defaults
- [ ] TypeScript compilation passes

### Manual
- [ ] VS Code settings (sdd.* namespace) appear in Settings UI

## Constraints
- Must use VS Code `workspace.getConfiguration('sdd')` for extension settings
- Must use fileSystem utility for project config I/O
- Do not add new dependencies

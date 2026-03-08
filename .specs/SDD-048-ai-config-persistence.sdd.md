---
spec_id: SDD-048
title: Implement AI config read/write persistence
status: draft
priority: high
complexity: medium
tags: [phase-2, backend, ai-config]
relevant_files:
  - src/config/aiConfig.ts
  - src/config/aiConfigTypes.ts
  - src/utils/constants.ts
must_not_touch:
  - src/extension.ts
  - src/config/projectConfig.ts
depends_on: [SDD-047]
budget_max_tokens: 80000
agent_skills: backend-dev
created: 2026-03-08
---

## Context

With AI configuration types defined in SDD-047, this spec implements the persistence layer for reading and writing the AI config to `.sdd/ai-config.json`. This follows the same file-based state pattern used by `projectConfig.ts` for `.sdd/config.json`. The config file must be created with defaults if it doesn't exist, and validated on read.

## Requirements

### Functional
- Implement `readAIConfig()` async function that reads `.sdd/ai-config.json` from the workspace root
  - If file doesn't exist, return `DEFAULT_AI_CONFIG`
  - If file exists but is invalid JSON, log a warning and return `DEFAULT_AI_CONFIG`
  - Validate that required fields exist; fill missing fields from defaults (merge strategy)
- Implement `writeAIConfig(config: AIConfig)` async function that writes to `.sdd/ai-config.json`
  - Create `.sdd/` directory if it doesn't exist
  - Write formatted JSON (2-space indent)
- Implement `getAvailableTags()` async function that scans `.specs/*.sdd.md` files and returns unique tags
- Implement `getAvailableSkills()` async function that scans `.claude/skills/` directory and returns skill folder/file names

### Non-Functional
- All functions must handle filesystem errors gracefully (return defaults or empty arrays, never throw)
- Follow the same patterns as `projectConfig.ts`

## Acceptance Criteria

### Automated
- [ ] Unit tests pass for readAIConfig (file exists, file missing, invalid JSON cases)
- [ ] Unit tests pass for writeAIConfig (creates file, creates directory)
- [ ] Unit tests pass for getAvailableTags and getAvailableSkills
- [ ] TypeScript compilation succeeds

### Manual
- [ ] Config file roundtrips correctly (write then read returns same data)

## Constraints
- Do not modify projectConfig.ts — create a separate module
- Use VS Code workspace API (`vscode.workspace.workspaceFolders`) for path resolution
- Do not add new dependencies

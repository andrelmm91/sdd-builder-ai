---
spec_id: SDD-056
title: Add commit and PR command fields to AIConfig types
status: done
priority: high
complexity: low
tags: [phase-2, refactor, backend]
relevant_files:
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
depends_on: []
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The review/approval pipeline currently hardcodes Git and GitHub operations (branch, commit, push, PR) inside the extension. This refactor delegates those operations to the AI agent by adding configurable shell commands to AIConfig that get injected into the execution prompt.

This spec adds two new optional command fields to the `AIConfig` type — `commitCommand` and `prCommand` — each with an `enabled` boolean toggle. These will be used by the execution context assembler (SDD-058) to append git/PR instructions to the prompt when enabled.

## Requirements
### Functional
- Add `commitCommand: string` field to the `AIConfig` interface with default value `git add -A && git commit -m "{spec_id}: {title}"`
- Add `commitCommandEnabled: boolean` field to `AIConfig` with default `false`
- Add `prCommand: string` field to `AIConfig` with default value `gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"`
- Add `prCommandEnabled: boolean` field to `AIConfig` with default `false`
- Update `DEFAULT_AI_CONFIG` to include the new fields with their defaults
- All existing AIConfig functionality must remain unchanged

### Non-Functional
- New fields must be optional-safe: existing `.sdd/ai-config.json` files without these fields must still load correctly via the merge-with-defaults pattern in `readAIConfig()`

## Acceptance Criteria
### Automated
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Existing tests pass (`npm test`)

### Manual
- [ ] `DEFAULT_AI_CONFIG` includes all four new fields with correct defaults

## Constraints
- Only modify `src/config/aiConfigTypes.ts`
- Do not change any persistence logic — `readAIConfig` already merges with defaults, so new fields are automatically handled
- Do not add new dependencies

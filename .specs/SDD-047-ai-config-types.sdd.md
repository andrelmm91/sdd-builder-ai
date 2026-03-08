---
spec_id: SDD-047
title: Define AI configuration types and constants
status: draft
priority: high
complexity: low
tags: [phase-2, backend, ai-config]
relevant_files:
  - src/config/aiConfigTypes.ts
  - src/execution/types.ts
  - src/utils/constants.ts
must_not_touch:
  - src/extension.ts
depends_on: []
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The SDD Agentic extension needs a global AI configuration system that allows users to select their AI provider (Claude or Copilot), permission mode, model, tag-to-skill mappings, and a custom pre-prompt template. This spec defines the TypeScript types, interfaces, and constants that underpin the entire AI configuration feature. All subsequent AI config specs depend on these types.

## Requirements

### Functional
- Define an `AIProvider` union type: `'claude' | 'copilot'`
- Define `ClaudePermissionMode` union: `'default' | 'dangerously-skip-permissions' | 'plan'`
- Define `CopilotPermissionMode` union: `'default' | 'yolo'`
- Define `PermissionMode` as `ClaudePermissionMode | CopilotPermissionMode`
- Define `TagSkillMapping` interface with `tag: string` and `skill: string` fields
- Define `AIConfig` interface with fields: `provider` (AIProvider), `permissionMode` (PermissionMode), `model` (string), `tagSkillMappings` (TagSkillMapping[]), `prePromptTemplate` (string)
- Define provider-specific model lists as readonly arrays:
  - Claude: `['opus', 'sonnet', 'haiku']`
  - Copilot: `['claude-sonnet-4.6', 'gpt-4o']`
- Define provider-specific permission mode lists as readonly arrays
- Add `AI_CONFIG_FILE` constant (`'.sdd/ai-config.json'`) to constants file
- Define a `DEFAULT_PRE_PROMPT` constant: `'Implement {spec_file}. Update open tasks in the spec after completion. Add unit tests if necessary. Commit with the SDD spec_id as message.'`
- Define a `DEFAULT_AI_CONFIG` constant with sensible defaults (Claude, default permissions, sonnet, empty mappings, default pre-prompt)

### Non-Functional
- All types must be exported for use by other modules
- Types must be strict — no `any` or loose typing

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation succeeds with no errors (`npm run type-check`)
- [ ] All types and constants are exported and importable

### Manual
- [ ] Types accurately represent the AI configuration domain from the product spec

## Constraints
- Do not implement any read/write logic — only type definitions and constants
- Do not modify existing execution types — create a new file for AI config types
- Only add the new constant to the existing constants file

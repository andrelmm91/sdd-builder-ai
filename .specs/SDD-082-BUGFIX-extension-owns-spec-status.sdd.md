---
spec_id: SDD-082-BUGFIX
title: Stop the default pre-prompt from asking the AI to edit spec status
status: done
priority: high
complexity: low
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/config/aiConfigTypes.ts
  - src/config/aiConfig.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
The default execution pre-prompt (`DEFAULT_PRE_PROMPT` in `src/config/aiConfigTypes.ts`) is `Implement {spec_file}. Update open tasks and its status to review after completion.` It asks the AI agent to edit the spec's YAML `status` field, while `executeSingleSpec()` also writes the status (`in_progress` → `review`/`ready`). Two writers on the same frontmatter cause race conditions, and the AI can corrupt the YAML or set `review` even when the run failed.

**Current behavior:** The AI and the extension both write `status`.

**Expected behavior:** Only the extension changes spec status. The AI may tick acceptance criteria checkboxes but must not touch the frontmatter.

## Requirements
### Functional
- Change `DEFAULT_PRE_PROMPT` to: `Implement {spec_file}. Tick the acceptance criteria checkboxes you have verified. Do not modify the spec frontmatter; status is managed by SDD.`
- Export the old default string as `LEGACY_PRE_PROMPT` from `src/config/aiConfigTypes.ts`.
- In `readAIConfig()` (`src/config/aiConfig.ts`), when the stored `ai.prePromptTemplate` is exactly `LEGACY_PRE_PROMPT`, return the new `DEFAULT_PRE_PROMPT` instead. This is an in-memory migration; the file is rewritten the next time the config is saved. Custom pre-prompts are returned unchanged.

### Non-Functional
- Backwards compatible: users with customized pre-prompts see no change.

## Acceptance Criteria
### Automated
- [x] `src/config/aiConfigTypes.test.ts` asserts `DEFAULT_PRE_PROMPT` contains `{spec_file}` and does not contain `status to review`.
- [x] `src/config/aiConfig.test.ts` covers: legacy prompt migrated, custom prompt preserved, missing prompt falls back to the new default.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] After executing a spec in a fresh project, the spec frontmatter is unchanged apart from the status written by the extension.

## Constraints
- Do not change how the pre-prompt is substituted or sent.
- Builder decision: confirm the new default wording before promoting to `ready`.

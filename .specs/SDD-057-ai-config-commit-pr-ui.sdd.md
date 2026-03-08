---
spec_id: SDD-057
title: Add commit and PR command controls to AI Config webview
status: draft
priority: high
complexity: medium
tags: [phase-2, refactor, frontend]
relevant_files:
  - webview-ui/src/aiConfig/AiConfig.svelte
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/views/webviews/aiConfig/AiConfigPanel.ts
depends_on: [SDD-056]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

SDD-056 added `commitCommand`, `commitCommandEnabled`, `prCommand`, and `prCommandEnabled` fields to the `AIConfig` type. This spec adds the corresponding UI controls to the AI Config webview panel so users can enable/disable and customize these commands.

The `AiConfigPanel.ts` does not need changes — it already reads and writes the full `AIConfig` object, so new fields are automatically persisted. Only the Svelte component needs UI additions.

## Requirements
### Functional
- Add a "Git Commands" section to the AI Config form, placed after the pre-prompt template section
- For the commit command:
  - A toggle switch (checkbox or button) for `commitCommandEnabled`
  - A text input (or textarea) for `commitCommand`, pre-filled with the default value
  - The text input must be disabled/greyed out when the toggle is off
- For the PR command:
  - A toggle switch for `prCommandEnabled`
  - A text input (or textarea) for `prCommand`, pre-filled with the default value
  - The text input must be disabled/greyed out when the toggle is off
- Both fields must be included in the `saveConfig` message payload
- On receiving `configData`, populate the toggle and command fields from the config
- Show a help note: "These commands are appended to the execution prompt so the AI agent handles git operations. Use `{spec_id}` and `{title}` as placeholders."

### Non-Functional
- UI must be consistent with existing form styling (VS Code theme variables, same spacing and label patterns)

## Acceptance Criteria
### Automated
- [ ] Webview builds without errors (`npm run build:webview`)
- [ ] TypeScript compiles (`npm run type-check`)

### Manual
- [ ] Toggle controls enable/disable the corresponding text inputs
- [ ] Saving and reopening the panel preserves the commit/PR command settings
- [ ] Help text is visible and clear

## Constraints
- Only modify `webview-ui/src/aiConfig/AiConfig.svelte`
- Do not modify `AiConfigPanel.ts` — it already handles the full AIConfig object
- Follow existing Svelte 5 patterns (`$state`, `$derived`)
- Use existing CSS class patterns from the component

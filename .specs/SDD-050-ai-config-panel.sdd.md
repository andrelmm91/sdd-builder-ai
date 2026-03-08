---
spec_id: SDD-050
title: Create AI Configuration panel class and command
status: done
priority: high
complexity: medium
tags: [phase-2, backend, ui, ai-config]
relevant_files:
  - src/views/webviews/aiConfig/AiConfigPanel.ts
  - src/extension.ts
  - src/config/aiConfig.ts
must_not_touch: []
depends_on: [SDD-048, SDD-049]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-08
---

## Context

With the AI config persistence layer (SDD-048) and Svelte UI (SDD-049) complete, this spec creates the TypeScript panel class that bridges them. It follows the singleton pattern established by DashboardPanel, KanbanPanel, and SpecFormPanel — extending BaseWebviewPanel, handling messages from the webview, and reading/writing config via the persistence layer. It also registers the `sdd.openAiConfig` command in extension.ts.

## Requirements

### Functional
- Create `AiConfigPanel` class extending `BaseWebviewPanel` with:
  - Singleton pattern: static `createOrShow(extensionUri)` method
  - Webview name: `'aiConfig'` (matches Vite entry point)
  - Panel title: `'AI Configuration'`
- Handle incoming messages from the webview:
  - `requestConfig` → read AI config via `readAIConfig()`, get available tags via `getAvailableTags()`, get available skills via `getAvailableSkills()`, post `configData` message with all three
  - `saveConfig` → write config via `writeAIConfig()`, show info notification "AI configuration saved"
- Register `sdd.openAiConfig` command in `extension.ts` that calls `AiConfigPanel.createOrShow(context.extensionUri)`
- Add command to package.json `contributes.commands` array

### Non-Functional
- Follow identical patterns to existing panel classes (dispose cleanup, reveal logic)
- Panel should open in the editor area (not sidebar)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation succeeds
- [ ] Extension builds without errors (`npm run build`)

### Manual
- [ ] Running `sdd.openAiConfig` command opens the AI Configuration panel
- [ ] Panel loads current config from file
- [ ] Saving config persists to `.sdd/ai-config.json`
- [ ] Panel is singleton (running command twice reveals existing panel)

## Constraints
- Follow BaseWebviewPanel patterns exactly
- Minimize changes to extension.ts — only add command registration

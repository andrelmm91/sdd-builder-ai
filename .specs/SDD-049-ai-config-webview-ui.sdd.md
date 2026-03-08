---
spec_id: SDD-049
title: Create AI Configuration Svelte webview component
status: done
priority: high
complexity: high
tags: [phase-2, frontend, ui, ai-config]
relevant_files:
  - webview-ui/src/aiConfig/AiConfig.svelte
  - webview-ui/src/aiConfig/index.ts
  - webview-ui/vite.config.ts
must_not_touch:
  - src/extension.ts
  - webview-ui/src/kanban/Kanban.svelte
depends_on: [SDD-047]
budget_max_tokens: 120000
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

This spec creates the Svelte 5 webview component for the AI Global Configuration panel. It follows the same patterns established by Dashboard.svelte, Kanban.svelte, and SpecForm.svelte — using Svelte 5 runes (`$state`, `$derived`), the shared `lib/vscode.ts` for messaging, and the same styling conventions. The component must be added as a new Vite entry point.

## Requirements

### Functional
- Create `AiConfig.svelte` component with the following form sections:
  - **AI Provider** dropdown: `Claude` | `Copilot` (default: Claude)
  - **Permission Mode** dropdown that changes options based on selected provider:
    - Claude: `Default (ask)`, `Full permissions (--dangerously-skip-permissions)`, `Plan mode (--plan)`
    - Copilot: `Default (ask)`, `Full permissions (--yolo)`
  - **Model** dropdown populated per provider:
    - Claude: `opus`, `sonnet`, `haiku`
    - Copilot: `claude-sonnet-4.6`, `gpt-4o`
  - **Tag → Skill Mapping** section:
    - Display a table/grid with columns: Tag, Skill (dropdown), Remove button
    - Tags populated from message data (sent by panel)
    - Skills populated from message data (sent by panel)
    - Allow adding new mappings and removing existing ones
  - **Custom Pre-prompt** textarea with default template pre-filled
  - **Save** button that sends config back to extension via `postMessage('saveConfig', configData)`
- Create `index.ts` entry point following the same pattern as other webview entries (mount Svelte component to `#app`)
- Add `aiConfig` entry to `webview-ui/vite.config.ts` input array
- On mount, send `postMessage('requestConfig')` to load current config
- Listen for `configData` message with current config + available tags/skills
- When provider changes, reset permission mode and model to that provider's first option

### Non-Functional
- Match the visual style of existing webview components (VS Code theme variables)
- Form must be responsive and usable in narrow panel widths
- Use Svelte 5 runes (`$state`, `$derived`) — no legacy `$:` syntax

## Acceptance Criteria

### Automated
- [ ] Vite build succeeds with the new entry point (`npm run build:webview`)
- [ ] TypeScript compilation succeeds

### Manual
- [ ] Provider dropdown changes update permission mode and model options dynamically
- [ ] Tag-skill mapping table allows adding, editing, and removing rows
- [ ] Save button sends correct config structure via postMessage
- [ ] Component renders with VS Code theme colors

## Constraints
- Follow the exact same patterns as existing Svelte components (mount API, postMessage, onMessage)
- Do not import from `src/` — webview code is isolated, types are duplicated or communicated via messages
- Do not modify existing webview components

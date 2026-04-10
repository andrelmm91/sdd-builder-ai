---
spec_id: SDD-074
title: Fix requirement board initial data load and add loading states
status: done
priority: high
complexity: medium
tags: [phase-2, bugfix, ui, backend]
relevant_files:
  - src/views/webviews/requirementBoard/RequirementBoardPanel.ts
  - webview-ui/src/requirementBoard/RequirementBoard.svelte
must_not_touch:
  - src/views/webviews/BaseWebviewPanel.ts
  - webview-ui/src/requirementBoard/FeatureForm.svelte
depends_on: [SDD-071]
agent_skills: fullstack-dev
created: 2026-03-09
---

## Context

Two related issues in the Requirement Board:

### Issue 1: Unhandled `requestRequirementBoardData` message (race condition)
`RequirementBoard.svelte` sends a `requestRequirementBoardData` message on mount (line 33), but `RequirementBoardPanel.handleMessage()` has no case for this message type. The panel relies solely on `sendFeatureCards()` being called in the constructor, but if the webview finishes mounting after the constructor's async call resolves, the webview receives nothing and shows an empty board.

Other panels handle this correctly — for example, `DashboardPanel` handles the `refresh` message type.

### Issue 2: No loading/disabled state on action buttons
When "Idealize Requirements" or "Create SDD Cards" is clicked, there is no loading indicator and the buttons remain active. Users can click multiple times, spawning duplicate AI processes that compete for the same files.

## Requirements

### Functional

**Backend (`RequirementBoardPanel.ts`):**
- Add a `requestRequirementBoardData` case in `handleMessage()` that calls `this.sendFeatureCards()`
- This ensures the webview always gets data when it mounts, regardless of timing

**Frontend (`RequirementBoard.svelte`):**
- Add a `loading` state variable (boolean, default `true`) that is set to `false` when `requirementBoardData` is received
- Show a loading indicator (simple "Loading..." text or spinner) while `loading` is `true`
- Add an `actionInProgress` state variable (string | null) tracking which feature is currently being processed (stores the feature name)
- When "Idealize Requirements" or "Create SDD Cards" is clicked:
  - Set `actionInProgress` to the feature's name
  - Disable all action buttons across all cards (not just the clicked one) to prevent concurrent AI processes
  - Show a visual indicator on the active card (e.g., "Processing..." text replacing the button)
- When new `requirementBoardData` arrives (which happens after the FileSystemWatcher detects changes from the AI), clear `actionInProgress` back to `null`

### Non-Functional
- The loading state should use VS Code theme-consistent styling
- Button disabled state should use `opacity: 0.5; cursor: not-allowed` consistent with `FeatureForm.svelte`

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Webview build succeeds (`npm run build:webview`)

### Manual
- [ ] Opening the Requirement Board always shows feature cards (no empty board race condition)
- [ ] Clicking "Idealize Requirements" disables all action buttons and shows processing state
- [ ] After AI completes and files change, buttons re-enable automatically
- [ ] Clicking rapidly on an action button does not spawn multiple processes

## Constraints
- Do not modify `BaseWebviewPanel.ts`
- Do not modify `FeatureForm.svelte`
- Keep the loading state simple — no need for a spinner component, text is sufficient

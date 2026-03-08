---
spec_id: SDD-062
title: Add request changes modal to kanban webview
status: done
priority: low
complexity: medium
tags: [phase-2, refactor, frontend]
relevant_files:
  - webview-ui/src/kanban/Kanban.svelte
  - src/views/webviews/kanban/KanbanPanel.ts
  - src/commands/reviewCommands.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: [SDD-059, SDD-061]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-08
---

## Context

The current "Request Changes" flow uses a VS Code input box (`vscode.window.showInputBox`) to capture feedback text, which is limiting for detailed feedback. This spec replaces it with a modal dialog inside the kanban webview, providing a richer UX:

- A textarea for feedback (pre-populated with the spec's acceptance criteria as a checklist)
- A toggle for "Re-execute immediately" (default on)
- On submit: saves feedback, reverts spec to ready, and optionally triggers re-execution with the feedback appended to the prompt context

The `contextAssembler.ts` already supports a `feedback` field in `ContextOptions` (section 6: "Previous Feedback"), so feedback from the modal flows naturally into re-execution prompts.

## Requirements
### Functional
- In `Kanban.svelte`, add a modal overlay component that appears when the user clicks "Request Changes" on a review card:
  - The modal must show the spec title and spec ID
  - A textarea pre-populated with the spec's acceptance criteria formatted as a markdown checklist (if available from the spec data)
  - A toggle/checkbox labeled "Re-execute immediately" (default: checked)
  - "Submit" and "Cancel" buttons
  - Clicking outside the modal or pressing Escape closes it
- On submit, send a `requestChanges` message to the extension with: `{ specId, feedback, reExecute: boolean }`
- In `KanbanPanel.ts`, handle the `requestChanges` message:
  - Save the feedback via `ReviewManager.submitDecision(specId, 'request_changes', feedback)`
  - If `reExecute` is true, execute the spec via `vscode.commands.executeCommand('sdd.executeSpec', filePath)` passing the spec's file path
- In `reviewCommands.ts`, update `createRequestChangesCommand` to accept an optional `feedback` parameter so it can be called programmatically from the panel without showing the input box
- The feedback text must be passed as additional context in the next execution's prompt (this is already supported by `contextAssembler.ts` via the `feedback` option — verify the wiring through `executeSpec.ts`)

### Non-Functional
- Modal must be accessible: focus trap, keyboard navigation, proper ARIA labels
- Modal backdrop must prevent interaction with the kanban behind it

## Acceptance Criteria
### Automated
- [ ] Webview builds without errors (`npm run build:webview`)
- [ ] TypeScript compiles (`npm run type-check`)

### Manual
- [ ] Clicking "Request Changes" on a review card opens a modal with textarea and toggle
- [ ] Textarea is pre-populated with acceptance criteria if available
- [ ] Submitting with "Re-execute" toggled on saves feedback and starts execution
- [ ] Submitting with "Re-execute" toggled off saves feedback and reverts to ready without executing
- [ ] Pressing Escape or clicking outside closes the modal without submitting
- [ ] Feedback text appears in the next execution's prompt context

## Constraints
- Only modify `webview-ui/src/kanban/Kanban.svelte`, `src/views/webviews/kanban/KanbanPanel.ts`, and `src/commands/reviewCommands.ts`
- Do not modify `contextAssembler.ts` — it already supports the `feedback` option
- Do not modify `executeSpec.ts` — use existing command execution
- Reuse existing CSS patterns and VS Code theme variables for the modal styling

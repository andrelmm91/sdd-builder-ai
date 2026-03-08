# Refactor: Review Stage & Approval Pipeline

## Goal
Simplify the review/approval flow by removing hardcoded GitHub operations from the extension pipeline and delegating commit/PR creation to the AI agent via configurable prompt commands.

---

## Changes

### 1. Remove GitHub actions from approval pipeline
**Status:** To do
**Current:** `reviewCommands.ts` approve flow runs: createBranch → stageFiles → commit → push → createPullRequest (lines 115-211), using `gitOps.ts` and `prCreator.ts`.
**Change:** Strip all git/GitHub operations from `createApproveSpecCommand`. Approve should only: transition spec → done, update file status, and refresh the kanban.
**Files:** `src/commands/reviewCommands.ts`, `src/github/gitOps.ts`, `src/github/prCreator.ts`

### 2. Commit & PR commands in AI Config
**Status:** To do
**Current:** `AIConfig` has `prePromptTemplate` only. No fields for commit/PR commands.
**Change:** Add two new fields to `AIConfig`:
- `commitCommand: string` — shell command appended to the execution prompt to commit changes (default: `git add -A && git commit -m "{spec_id}: {title}"`)
- `prCommand: string` — shell command appended to the execution prompt to create a PR (default: `gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"`)
- Each has an `enabled: boolean` toggle (UI: toggle buttons in AI Config panel)
- Commands are injected into the prompt during `executeSpec` context assembly when enabled
- This lets the AI agent handle git operations as part of execution, not the extension
**Files:** `src/config/aiConfigTypes.ts`, `src/config/aiConfig.ts`, `src/execution/executeSpec.ts`, `webview-ui/src/aiConfig/AiConfig.svelte`, `src/views/webviews/aiConfig/AiConfigPanel.ts`

### 3. Auto-move to review on finish
**Status:** Done
**Where:** `src/commands/executeSpec.ts` line 176 — `await updateSpecStatus(uri, content, 'review')` on success. No changes needed.

### 4. Show changed files in review cards
**Status:** To do
**Current:** Changed files are captured in `CaptureResult.changedFiles` and written to execution logs, but never displayed in the kanban.
**Change:** Below each review card in the kanban, render a collapsible file list showing files changed during execution (with added/modified/deleted indicators). Data source: read from execution log or persist `changedFiles` array in `ExecutionRecord`.
- Approve button: moves card to done + updates spec status (no git operations)
**Files:** `src/execution/types.ts` (add `changedFiles` to `ExecutionRecord`), `src/execution/resultCapture.ts`, `webview-ui/src/kanban/Kanban.svelte`, `src/views/webviews/kanban/KanbanPanel.ts`

### 5. Request changes → re-execution flow
**Status:** To do (UX refinement)
**Current:** `createRequestChangesCommand` captures text feedback, saves review record, reverts spec to "ready", offers re-execution.
**Change:** Replace the current VS Code input box with a modal in the kanban webview:
- Textarea for feedback (pre-populated with the spec's acceptance criteria as checklist)
- Toggle: "Re-execute immediately" (default on)
- On submit: saves feedback → reverts to ready → if toggle on, auto-triggers execution with feedback appended to prompt context
- The feedback markdown is passed as additional context in the next execution's prompt
**Files:** `webview-ui/src/kanban/Kanban.svelte`, `src/views/webviews/kanban/KanbanPanel.ts`, `src/commands/reviewCommands.ts`, `src/execution/executeSpec.ts`

---

## Execution Order
1. **#2 first** — Add commit/PR command fields to AI Config (no breaking changes)
2. **#1 next** — Remove hardcoded git operations from approve flow (depends on #2 being available)
3. **#4** — Add changed files display to review cards (independent)
4. **#5 last** — Improve request changes UX (independent but lower priority)

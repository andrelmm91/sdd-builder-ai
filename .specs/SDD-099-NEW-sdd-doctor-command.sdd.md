---
spec_id: SDD-099-NEW
title: Add SDD Doctor environment check with a readiness banner on the Dashboard
status: review
priority: medium
complexity: high
tags:
  - feature
  - phase-6
  - backend
  - frontend
  - rel-v2.0
relevant_files:
  - src/commands/doctor.ts
  - src/commands/initProject.ts
  - src/views/webviews/dashboard/DashboardPanel.ts
  - webview-ui/src/dashboard/Dashboard.svelte
  - src/extension.ts
  - package.json
must_not_touch:
  - src/commands/executeSpec.ts
  - src/execution/cliRunner.ts
depends_on:
  - SDD-078-BUGFIX
  - SDD-092-NEW
agent_skills: backend
created: 2026-10-15
---



## Context
New users, especially vibe coders, hit setup problems at execution time: the AI CLI is not installed or not logged in, the workspace is not a git repo (so change tracking and discard don't work), there are uncommitted changes, no test command is set, or `conventions.md` is still the empty template. A single check that runs automatically, and explains each fix in plain language in a place the user already looks, reduces failed first runs.

The user should not have to remember to run anything. The banner disappears once every check passes.

Today `initProject()` ends with its own health check toast hard-coded to the Claude CLI (`Health: Git ✓, Claude CLI ✓, gh CLI ✓`). That check ignores the provider definitions from SDD-092 and would duplicate or contradict the doctor, so the doctor replaces it.

## Requirements
### Functional
#### Doctor module (`src/commands/doctor.ts`)
- Export `runDoctor(): Promise<DoctorReport>`.
- `DoctorCheck = { id: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string }`.
- `DoctorReport = { checks: DoctorCheck[]; ranAt: string /* ISO */; ready: boolean }`. `ready` is `true` when no check has status `fail`; warnings do not block readiness.
- Checks:
  1. `.sdd/config.json` exists and parses (fail).
  2. The configured provider's binary is available, using `getProviderBinary` from SDD-078 or the provider definitions from SDD-092 (fail).
  3. `git` is available and the workspace is a git repository (warn; detail explains that change tracking and discard are disabled).
  4. Working tree is clean (warn; detail lists the count of modified files).
  5. `.sdd/conventions.md` has content beyond the template's comment lines (warn).
  6. The permission mode is noted: a batch mode is required for bulk execution (info rendered as `ok` with detail).
- Keep the last report in memory and expose it to other modules:
  - `getLastDoctorReport(): DoctorReport | undefined`
  - `onDoctorReport: vscode.Event<DoctorReport>`, fired every time `runDoctor()` completes
- Concurrent calls to `runDoctor()` while a run is in progress return the same in-flight promise instead of starting a second run.

#### When the doctor runs
- **After init:** `initProject()` calls `runDoctor()` after creating the folders and scaffold files. It replaces the existing git/Claude/gh health check and toast with a simple `SDD project initialized.` notification.
- **On VS Code open:** in `activate()`, if `.sdd/config.json` exists, call `void runDoctor()` in the background without blocking activation. If the workspace is not initialized, skip the doctor; the existing "Initialize now?" prompt and the Dashboard init card already cover that.
- **On demand:** register the command `sdd.doctor` (title `SDD: Run Doctor`) in `package.json` and `src/extension.ts`. It runs `runDoctor()` and opens the Dashboard (`DashboardPanel.createOrShow`).

#### Dashboard banner
- `DashboardPanel` subscribes to `onDoctorReport` and posts `doctorReport` with the `DoctorReport` to the webview. When the panel opens, it sends `getLastDoctorReport()` if one exists; otherwise it triggers `runDoctor()`. Dispose the subscription in `dispose()`.
- `DashboardPanel` handles a `runDoctor` message from the webview by calling `runDoctor()`. The result reaches the webview through the `onDoctorReport` subscription.
- `Dashboard.svelte` renders a banner between the page header (title + "Open SDD Kanban" / "Open Requirement Board") and the first card, only when the report has at least one `warn` or `fail` check:
  - Heading: `Not ready to execute: N blocking problem(s)` (error style) when `ready` is false, otherwise `Ready to execute, with N warning(s)` (warning style).
  - One row per non-`ok` check: ✗ or ⚠ icon, `label`, `detail`, and `fix` as a hint when present.
  - A **Re-check** button that posts `runDoctor` and shows a spinner/disabled state until the next `doctorReport` arrives.
- When every check is `ok`, the banner is not rendered (it disappears after a successful Re-check, init, or on next VS Code open).
- While the project is not initialized (`notInitialized`), the banner is not rendered; only the existing init card shows.
- Use VS Code theme variables for colors (`--vscode-inputValidation-errorBorder`, `--vscode-inputValidation-warningBorder`, etc.), consistent with the existing Dashboard card styling.

### Non-Functional
- All checks complete in under 5 seconds on a typical machine; each external command uses a 5 s timeout.
- The doctor runs off the activation critical path; activation must not await it.
- Checks never modify anything.
- No toast notifications from the doctor; the Dashboard banner is the only surface.

## Acceptance Criteria
### Automated
- [x] `src/commands/doctor.test.ts` covers each check's ok, warn and fail paths with mocked shell and file system.
- [x] A test asserts `ready` is `true` with only warnings and `false` when any check fails.
- [x] A test asserts concurrent `runDoctor()` calls share one run, and `onDoctorReport` fires with the result.
- [x] `src/commands/initProject.test.ts` asserts `runDoctor` is called after scaffolding and the old `Health:` toast is gone.
- [x] A test asserts `sdd.doctor` is declared in `package.json`.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Initializing SDD in a fresh, non-git folder shows the Dashboard banner with the git warning and a fix hint below the title and "Open SDD Kanban".
- [ ] After running `git init` and committing, clicking **Re-check** updates the banner; once all checks pass, the banner disappears.
- [ ] Reopening VS Code on an initialized workspace with a missing provider CLI shows the `Not ready to execute` banner when the Dashboard opens.
- [ ] Reopening VS Code on a healthy workspace shows no banner.

## Constraints
- In `src/extension.ts`, only add the import, the `sdd.doctor` command registration, and the background `runDoctor()` call for initialized workspaces.
- In `src/commands/initProject.ts`, only replace the health-check block and its toast with the `runDoctor()` call and the simplified notification; do not change the scaffolding.
- Do not open the Dashboard automatically on activation; the banner shows the next time the user opens it.

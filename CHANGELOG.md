# Changelog

All notable changes to the SDD Platform extension will be documented in this file.

## [2.0.0] - 2026-10-18

- **Discard AI changes, only on Reject** (NEW) — New `SDD: Discard AI Changes` command (`sdd.discardChanges`) reverts exactly the files an execution changed to their state before the run, keeping your unrelated edits, after one confirmation. Reject now uses it instead of `git checkout HEAD` (single "Reject & Discard" confirmation; without a checkpoint it rejects and keeps the files). Request Changes never touches files and flags the execution so the re-run reuses the original checkpoint, so a later Reject discards the work from all attempts. If the AI committed, files are restored and you are warned that the commits remain.
- **Accurate changed files per execution** (NEW) — Executions now take a git checkpoint right before the spec moves to In Progress and compute `changedFiles` against it, so review cards list exactly what the AI changed: new untracked files and files it committed are included, your pre-existing uncommitted edits are not. The checkpoint is stored in `exec-NNN.json` (optional, old records still load) for the upcoming Discard feature, and a record flagged `reuseCheckpointOnNextRun` makes the next run reuse it so re-runs after Request Changes are cumulative. Outside a git repository execution continues with a one-time notice that change tracking is unavailable.
- **Restore checkpoint** (NEW) — New `restoreCheckpoint` in `src/execution/gitCheckpoint.ts` reverts only the files an execution changed to their state before the run (`M`/`D` restored from the checkpoint, new files deleted, renames undone) and leaves your unrelated edits alone. It never uses `reset --hard`, `clean` or `stash pop`, records per-file failures instead of aborting, and reports `headMoved` when the AI committed (commits are not reset). Not wired to a command or UI yet.
- **Git checkpoint service** (NEW) — New `src/execution/gitCheckpoint.ts` snapshots the git state before execution (`createCheckpoint`) and computes exactly what changed since (`getChangesSince`), including files the AI created or committed and excluding your pre-existing uncommitted changes. It never modifies the working tree, index or stash list. Not wired into execution yet.
- **Extension owns spec status** (BUGFIX) — The default pre-prompt no longer asks the AI to set the spec status to `review`; it now asks it to tick verified acceptance criteria and leave the frontmatter alone, so only the extension writes `status`. Projects still using the old default are migrated in memory on read; custom pre-prompts are untouched.
- **Recover specs stuck In Progress** (BUGFIX) — If VS Code is closed, reloaded or crashes mid-execution, specs left `in_progress` are detected on activation and you are offered a one-click "Reset to Ready". `in_progress → ready` is now also a valid manual transition, so the card can be dragged back. Recovery never runs while an execution is active.
- **Hardened command availability and security check** (BUGFIX) — `isCommandAvailable` now rejects empty names and names containing anything other than letters, digits, `. _ - / \ : ~` and spaces, without spawning a process, and quotes valid names for the target shell. A malicious `sdd.claudeCliBinary` or test command in `.sdd/config.json` can no longer inject shell commands. Post-validation reports `Invalid test command: "<base>"` for rejected test commands.
- **Platform-correct shell quoting** (BUGFIX) — Prompts, spec titles and skill paths are now quoted for the shell that runs them: bash on macOS/Linux and PowerShell on Windows (single quotes doubled, embedded `"` escaped for native executables). Apostrophes (e.g. `Don't modify tests`) no longer break the CLI command on Windows. New shared helper `src/utils/shellQuote.ts` replaces the duplicated local quoting functions.
- **Provider-aware CLI pre-flight check** (BUGFIX) — Executing a spec now verifies the binary of the configured AI provider (`gh` for Copilot, the Claude binary otherwise) instead of always requiring Claude. Copilot users without Claude installed are no longer blocked, and the "CLI not found" error names the provider and binary.
- **Edit model lists in the AI Configuration UI** (NEW) — New "Model Lists" section lets you customize, reorder, add, remove and reset the Claude/Copilot model lists and save them to `ai.models` without editing `config.json`; the model dropdowns refresh immediately. Saving the execution or requirements form no longer touches `ai.models`.
- **Updated model lists + per-provider overrides** (NEW) — Claude now offers `fable`, `opusplan`, `opus[1m]` and `sonnet[1m]`; Copilot adds the 5.5 Claude models. Model lists now come from a single source in the extension, and you can define your own per provider under `ai.models` in `.sdd/config.json` (replaces the built-in list). A saved model that is in no list is still shown and kept.

## [1.2.0] - 2026-05-21

- **Windows Claude/Copilot CLI PTY fix** — Reverted the Windows PowerShell script approach (`-File`/`-Command`) because launching Claude CLI via a `shellPath`-overridden terminal breaks its TTY detection, causing a blank terminal with no output. Windows now uses a plain VS Code terminal (no `shellPath` override) with `sendText` after a 500 ms startup delay. The zsh ZLE init race that required the bash-script fix on POSIX does not exist for PowerShell, so `sendText` is safe here. Non-interactive mode sends the command with `Tee-Object` + `$LASTEXITCODE | Out-File` chained via `;`; interactive mode sends the command bare and waits for terminal close.

## [1.1.0] - 2026-05-08

- **Terminal Command Race Condition** — Replaced `sendText`-based command delivery with a temp bash script launched as the terminal's `shellPath`. This eliminates a zsh PTY initialization race on macOS/WSL2 where commands appeared on screen but silently failed (exit 130/SIGINT) because zsh's ZLE startup consumed the input before the shell was ready.
- **Removed unsupported `--model` flag for `gh copilot`** — The GitHub Copilot CLI does not accept a `--model` flag; removed the flag from command construction to prevent invocation errors.
- **Windows compatibility preserved** — The bash-script approach is POSIX-only; Windows targets retain the original `sendText` path with its 1-second delay.

## [1.0.1] - 2026-04-10

- **Fixing README.md pictures** — Fixing broken image links in the README.md file by replacing local paths with absolute URLs to ensure they render correctly on GitHub and other platforms.

## [1.0.0] - 2026-04-10

- **Project Initialization** — `SDD: Initialize Project` command scaffolds the `.sdd/` and `.specs/` folder structure with config, conventions, and skill files
- **SDD Spec Format** — YAML frontmatter + Markdown spec files (`.sdd.md`) with `spec_id`, `status`, `priority`, `complexity`, `relevant_files`, `must_not_touch`, `depends_on`, `budget_max_tokens`, and `agent_skills` fields
- **Spec Parser & Validator** — JSON Schema validation with inline VS Code diagnostics for all spec files
- **Spec Lifecycle State Machine** — Enforced transitions: `draft → ready → in_progress → review → done`
- **Sidebar Tree View** — Browse and manage all specs with status indicators from the VS Code Activity Bar
- **Overview Dashboard** — Webview with spec counts by status, completion percentage, tag overview, and recent activity feed; all execution logs saved in `.sdd/execution/`
- **Requirement Board** — Capture feature ideas with AI Idealization (architect-style requirements doc) and one-click AI Spec Generation (dependency-ordered SDD cards)
- **Kanban Board** — Five-column drag-and-drop board with validated status transitions and card management
- **Bulk Execution** — Select multiple Ready specs and execute them sequentially with real-time per-card progress (spinner, checkmark, failure indicator); stops on failure for review
- **Spec Execution via Claude CLI / GitHub Copilot CLI** — Token budget enforcement, scoped context assembly, and real-time terminal output
- **Scoped Execution Constraints** — 3-file max per spec, `relevant_files` for precision context, `must_not_touch` for file protection, `conventions.md` injected into every run
- **Tag-to-Skill Mappings** — Skill files (`.md`) auto-injected into the execution prompt when a spec tag matches (e.g. `python`, `react`, `database`)
- **Post-Execution Validation** — TypeScript compilation, test runner, and lint checks after each execution
- **Split-View Diff Reviewer** — Side-by-side spec vs. changes with approve / request-changes / reject flow
- **Request Changes Flow** — Reviewer feedback appended to spec context; status resets to Ready so AI receives exact feedback in the next run
- **Git Integration** — Automatic branch creation, commit, and PR via `gh` CLI (configurable per project)
- **AI Configuration** — Separate provider config for requirements AI and execution AI; supports Full Permission mode (watch sentinel auto-advances card) and Plan mode (manual advance); customizable prompt templates for idealization, spec generation, and execution phases
- **Planning Agent Integration** — `sdd.createSddCards` command invokes the SDD Planner skill to decompose an idealization document into `.sdd.md` spec files in `.specs/`; post-validates creation and updates feature statuses to `SDD Created`
- **Progress Notifications** — Cancellable progress toasts during AI spec generation and bulk execution
- **Getting Started Walkthrough** — Built-in VS Code walkthrough for first-time onboarding

---
# Changelog

All notable changes to the SDD Platform extension will be documented in this file.

## [2.0.0] - 2026-10-18

- **Smarter execution timeouts** (NEW) — Bigger specs now get more time to finish, so the AI is no longer stopped halfway through a hard task. Low-complexity specs get 10 minutes, medium get 20 and high get 30.
  - **Adjust it to your project:** in **AI Configuration → SDD Execution**, set the **Execution timeout multiplier** to give every spec more time (e.g. `2` doubles it) or less (e.g. `0.5` halves it).
  - **Clear message when time runs out:** a timed-out run tells you how long the limit was and where to raise it.
- **Run a spec with a different model** (NEW) — The **Execute** button on Ready cards in the Kanban board now has a small **▾** next to it. Click it to pick another model for that run only, for example a cheaper, faster model for a simple spec. Your AI Configuration stays as it is, so the next run goes back to your usual model. The menu lists the models of your current provider, with your default marked, and the progress message shows which model is running (`Executing SDD-042 (haiku)`). Clicking **Execute** itself works exactly as before.
- **Bring your own AI CLI** (NEW) — You're no longer limited to Claude and Copilot. Any agent CLI, such as Codex, Gemini CLI, Aider or OpenCode, can now run your specs and power the requirements AI.
  - **Add providers directly to the Config UI:** open **AI Configuration → Custom Providers** and click **Add provider**. Start from a blank form or from a copy of Claude or Copilot, then fill in the command, its arguments, permission modes and suggested models.
  - **See mistakes before you save:** the form checks your input as you type and shows each problem next to the field. It also shows the exact command each permission mode will run, and warns you if the CLI isn't installed. Save stays disabled until everything is valid.
  - **Use it right away:** new providers appear at once in the provider dropdowns and in Model Lists, each with its own permission modes. You can also type any model name, not just the suggested ones.
  - **Safe by design:** you can't delete a provider that's in use, and saving other settings never changes your providers. If a provider in `.sdd/config.json` was edited by hand and is invalid, SDD skips it and tells you what's wrong. If the selected provider no longer exists, SDD falls back to Claude.
  - **Nothing changes for current users:** Claude and Copilot work exactly as before. One small exception: in the requirements AI, Copilot's default (ask) mode now opens an interactive session, the same way spec execution already does.
- **Clearer AI Configuration layout** (TECHDEBT) — The four parts of AI Configuration (SDD Execution, Requirements AI Config, Model Lists and Custom Providers) now each sit in their own colored box with a header (blue, purple, green and orange), instead of running together on one background separated by thin lines. It's easier to see where each part starts and which Save button belongs to it. The colors follow your VS Code theme, including light, dark and high-contrast. Nothing changes in how the settings work.
- **Instructions are handed to the AI as a file** (NEW) — Instead of pasting one huge command into the terminal, SDD now saves the full instructions for each run (your pre-prompt, the spec, relevant files, skills, scope rules and commit/PR commands) to a Markdown file and simply tells the AI CLI to read it. Long specs, special characters and multi-line text no longer break or get cut off, on any platform. Each file is kept in `.sdd/executions/<specId>/`, so you can open it at any time and see exactly what the AI was asked to do.
- **Leaner, smarter prompts** (TECHDEBT) — The way SDD builds the execution prompt has been reworked. The AI now gets a reference to the spec file and the paths of the relevant files rather than copies of their contents, which keeps prompts short and saves tokens. The prompt also tells the AI that SDD checks the scope after the run. Very large prompts are trimmed cleanly (no broken characters) and marked with `[truncated by SDD]` so you know when it happened.
- **Warn about interactive runs with no changes** (NEW) — When an interactive session ends and no files changed (ignoring the spec file and `.sdd/`), SDD asks `Send to Review` or `Back to Ready` instead of silently moving the card to Review. Back to Ready (or dismissing) marks the execution as aborted and returns the spec to Ready.
- **Safety net: undo any AI run** (NEW) — Before each execution, SDD takes a git checkpoint. Review cards now list exactly what the AI changed (including new and committed files, never your own edits). **Reject** puts those files back the way they were after a single confirmation, without touching your unrelated work. **Request Changes** keeps the AI's work so the re-run builds on it and saves tokens, and a later Reject still undoes every attempt. Review cards on the Kanban board have a **Reject** button that discards and moves the card back to Draft; `SDD: Discard AI Changes` only undoes the files. Requires a git repository.
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
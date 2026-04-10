# Changelog

All notable changes to the SDD Platform extension will be documented in this file.

## [1.0.0] - 2026-04-10

### Added

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

### Changed

## [1.0.1] - 2026-04-10

- **Fixing README.md pictures** — Fixing broken image links in the README.md file by replacing local paths with absolute URLs to ensure they render correctly on GitHub and other platforms.

---
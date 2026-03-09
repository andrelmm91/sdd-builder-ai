# SDD Platform — VS Code Extension

**Spec-Driven Development: turn structured specs into working code via AI agents.**

SDD Platform brings a governed, repeatable workflow for AI-assisted development right into VS Code. Instead of pasting vague prompts into a chat window and hoping for the best, you write small, precise spec files that tell the AI agent exactly what to build, which files to touch, and what "done" looks like. The agent executes, you review the diff, and you ship — all without leaving your editor.

---

## How It Works

```
Describe Requirements → AI Plans Specs → Review & Refine → Execute (Claude/Copilot CLI) → Review Diff → Ship PR
```

The core primitive is a `.sdd.md` **spec file** — a small, independently executable contract. Each spec has a clear scope (one thing, one day, ≤ 3 files), structured requirements, acceptance criteria, and an explicit list of relevant files so the agent has all the context it needs without guessing.

Because specs are plain markdown files, everything is version-controlled. Your entire development history — requirements, executions, reviews, feedback — lives in Git alongside your code.

---

## Features

### Spec Authoring

**Templates** — Start a new spec in seconds with `SDD: New Spec from Template`. Choose from Feature, Bug Fix, or Refactor templates that pre-fill the right sections for each type of work.

**Structured form** — Rather than editing raw markdown, use `SDD: New Spec Form` to fill in a guided UI with fields for every frontmatter property and each body section. The form compiles to a valid `.sdd.md` on save.

**File path IntelliSense** — When editing `relevant_files` or `must_not_touch` in a spec, the extension autocompletes workspace-relative file paths. No more typos in file references.

**Live validation** — The extension validates specs on save, showing inline errors (red squiggles) and Problems panel entries for things like missing required fields, too many files in scope, or unknown status values.

### Planning

**AI planning** — Run `SDD: Plan Specs from Requirements` and describe what you want in plain English. The SDD Planner agent decomposes your requirements into a set of `.sdd.md` files in `.specs/`, each with sequential IDs, dependency links, and pre-filled `relevant_files` lists.

```
Add user authentication with email/password login, password reset, and session management
```

The planner figures out the right order — foundation types first, features next, integration wiring last — and sets up `depends_on` links so you always know what to build first.

### Navigation

**Sidebar tree view** — The SDD sidebar groups all your specs by status (Draft, Ready, In Progress, Review, Done) with quick-action buttons for each state. Right-click any spec for context menu actions.

**Kanban board** — Open `SDD: Open Kanban Board` for a visual 5-column board. Cards show spec ID, title, complexity, priority, and tags. You can drag cards between adjacent valid columns to transition status, filter by ID, title, or tag in real-time, and open AI Config directly from the board header.

**Status bar** — The VS Code status bar always shows a live count of specs in flight (`SDD: N ready, N running`). Click it to jump to the dashboard.

**Dashboard** — `SDD: Open Dashboard` gives you a project overview: spec counts by status, completion percentage, recent activity, and cost charts — so you always know where the project stands.

### Execution

**Claude CLI execution** — When you execute a spec, the extension assembles a full context package (spec file + relevant file contents + conventions + agent skills), injects it into Claude CLI, and streams output to a dedicated terminal. You can watch the agent work in real time.

**Config-aware pipeline** — The execution pipeline reads your AI Config at runtime to apply the right provider, model, permission mode, and tag-to-skill mappings. A spec tagged `backend` can automatically use a different agent persona than one tagged `frontend`.

**Token budget enforcement** — Each spec declares a `budget_max_tokens` limit. The execution pipeline enforces this ceiling so no single spec burns through your budget unexpectedly.

**Post-execution validation** — After execution completes, the extension automatically runs your configured test command (e.g., `npm test`) and captures the results alongside the execution record.

**Bulk execution** — In the Kanban board, use `[+ Bulk]` to queue multiple Ready specs, then `[Execute All]` to run them sequentially. A progress panel tracks each item's status as the queue runs.

### Review

**Split-view review** — When a spec moves to Review, click it to open a split view: the spec on the left (requirements, acceptance criteria), the multi-file diff on the right, and an execution summary at the bottom (tokens, duration, test results, list of changed files).

Review cards in the Kanban board show a collapsible changed-files list inline — green for added, yellow for modified, red for deleted — so you can triage at a glance without opening the full review.

From the review view you have three choices:

| Action | What happens |
|---|---|
| **Approve** | Spec status moves to `done`. That's it — git/PR work is handled by the agent if you configured post-execution commands. |
| **Request Changes** | You write feedback. It gets appended directly to the spec's `## Context` section and the status resets to `ready`. On the next execution the agent reads your feedback as part of the spec. |
| **Reject** | Agent changes are reverted via `git checkout` and the spec goes back to `draft`. |

### AI Config

**`SDD: Open AI Config`** — A dedicated settings panel for everything AI-related:

- **Provider & Model** — Select your AI provider and model ID.
- **Permission Mode** — Control what the agent is allowed to do autonomously.
- **Tag-to-Skill Mappings** — Map spec tags to agent persona files. When a spec has a matching tag, the mapped skill file is injected instead of the spec's default `agent_skills` value.
- **Post-Execution Commands** — Enable a commit command and/or PR command that the agent runs automatically after implementation. Use `{spec_id}` and `{title}` as placeholders:

```bash
# Commit command
git add -A && git commit -m "feat: {title} ({spec_id})"

# PR command
gh pr create --title "{title}" --body "Closes {spec_id}"
```

AI Config is stored in `.sdd/ai-config.json` and version-controlled with your project.

### Tracking & Estimation

**Cost tracking** — Every execution saves a record to `.sdd/executions/{SPEC_ID}/exec-NNN.json` with token usage, cost, duration, status, and the list of changed files. Cost charts appear in the dashboard.

**Scope estimation** — `SDD: Open Dashboard` includes a scope estimate: spec count broken down by complexity (low / medium / high) and grouped by phase or area tag, so you can communicate rough effort before you start executing.

### Onboarding

**Getting Started walkthrough** — On first activation (when no `.sdd/config.json` exists), the native VS Code "Getting Started" walkthrough opens automatically. It walks you through initialization, creating your first spec, marking it ready, executing it, and reviewing the output — one step at a time with links to the exact commands.

---

## Requirements

- VS Code 1.85+
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) installed and authenticated
- Git configured in the workspace
- [gh CLI](https://cli.github.com/) (for GitHub integration)

---

## Getting Started

### 1. Install the Extension

Search for **SDD Platform** in the VS Code Extensions panel, or install via:

```
ext install sdd-platform
```

On first activation the **Getting Started with SDD** walkthrough opens automatically, guiding you through each step below.

### 2. Initialize a Project

Open your project in VS Code and run:

```
SDD: Initialize Project
```

This scaffolds the SDD folder structure and runs a health check to verify Claude CLI, `gh`, and Git are available:

```
your-project/
├── .specs/              # Where your spec files live
├── .sdd/
│   ├── config.json      # Project settings (prefix, test command)
│   ├── ai-config.json   # AI provider, model, permission mode, git commands
│   ├── conventions.md   # Code conventions injected into agent context
│   └── skills/
│       └── sdd-planner.md   # Default AI planner persona
```

The `conventions.md` file is especially important — anything you write here (naming conventions, architecture rules, preferred libraries) gets injected into every agent execution, so the AI builds to your standards from the start.

### 3. Configure AI Settings

Run `SDD: Open AI Config` to choose your provider and model, set the permission mode, and optionally configure tag-to-skill mappings and post-execution git/PR commands.

### 4. Plan Your Specs

Run `SDD: Plan Specs from Requirements` and describe what you want to build in natural language. The SDD Planner agent decomposes your requirements into a set of `.sdd.md` spec files in `.specs/`, with sequential IDs, dependency links, and relevant file lists pre-filled.

### 5. Review and Refine

Generated specs open in the editor. Browse them in the sidebar under "Draft". You can:
- Edit any spec to adjust scope or acceptance criteria
- Delete specs you don't want

When a spec is ready, run `SDD: Mark Spec as Ready` (or use the sidebar action). Validation must pass before the transition is allowed.

### 6. Execute

Right-click a **Ready** spec in the sidebar → **Execute Spec**, or run `SDD: Execute Spec`.

The extension:
1. Assembles context: spec + relevant file contents + conventions + agent skills
2. Injects post-execution git/PR commands (if enabled in AI Config)
3. Spawns Claude CLI in a dedicated terminal
4. Sets spec status to `in_progress`
5. After completion: captures `git diff`, changed files list, token usage, and runs your test command

### 7. Review the Output

When execution completes, the spec moves to **Review**. Click it in the sidebar to open split view:

- **Left:** the spec (requirements, acceptance criteria)
- **Right:** multi-file diff of everything the agent changed
- **Bottom:** execution summary (tokens, duration, test results, list of changed files)

Then approve, request changes, or reject.

> **Note:** Post-execution git operations (commit, branch, PR) are performed by the agent itself if you configure the commands in AI Config. The Approve action only transitions the spec status.

### 8. Ship to GitHub

If you configured post-execution commands in AI Config, the agent runs them automatically at the end of execution:

```bash
git add -A && git commit -m "feat: add password reset flow (PROJ-043)"
gh pr create --title "Add password reset flow" --body "Closes PROJ-043"
```

Alternatively, run these commands manually from the terminal after approving.

---

## Spec File Format

Every spec is a `.sdd.md` file with YAML frontmatter and a structured markdown body. The frontmatter tells the extension how to manage the spec; the body tells the agent what to build.

```markdown
---
spec_id: PROJ-042
title: Add password reset flow
status: draft
priority: high
complexity: medium
tags: [mvp, backend, auth]
relevant_files:
  - src/auth/login.ts
  - src/auth/types.ts
must_not_touch:
  - src/auth/oauth.ts
depends_on: []
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context
What this spec addresses and why. The agent reads this first.

## Requirements
### Functional
- User can request password reset via email
- Reset link expires after 1 hour

### Non-Functional
- Rate limit: max 3 reset requests per hour per email

## Acceptance Criteria
### Automated
- [ ] Unit tests pass for reset token generation

### Manual
- [ ] Reset email contains correct link format

## Constraints
- Must use existing email service (Resend)
- Must not modify OAuth flow

## Examples
Input: POST /auth/reset {email: "user@example.com"}
Output: 200 {message: "Reset email sent"}
```

**Key frontmatter fields:**

| Field | Purpose |
|---|---|
| `relevant_files` | Files the agent should read for context. Be explicit — don't make the agent guess. |
| `must_not_touch` | Files the agent must not modify. Protects sensitive or shared code. |
| `depends_on` | Other spec IDs that must be done first. Forms a dependency DAG. |
| `budget_max_tokens` | Token ceiling for this execution. Defaults to 100,000. |
| `agent_skills` | Which persona file from `.sdd/skills/` to load for this spec. |

**Constraints enforced by validation:**
- Maximum 3 files to create/edit (excluding tests) — keeps scope small and reviewable
- Single responsibility — one spec does one thing
- Must be completable in ≤ 1 day
- No circular dependencies — the `depends_on` graph must be a DAG

**Status lifecycle:** `draft → ready → in_progress → review → done`

**Request Changes flow:** Feedback is appended directly to the spec's `## Context` section and status is reset to `ready`. On the next execution, the agent sees the feedback as part of the spec — no separate feedback files, no extra config.

---

## Commands

| Command | Description |
|---|---|
| `SDD: Initialize Project` | Scaffold `.sdd/` and `.specs/` folders, run health check |
| `SDD: New Spec from Template` | Generate a spec from Feature / Bug Fix / Refactor template |
| `SDD: New Spec Form` | Open structured form UI to create or edit a spec |
| `SDD: Plan Specs from Requirements` | AI decomposes natural language requirements into specs |
| `SDD: Validate Current Spec` | Manually trigger validation on the open spec file |
| `SDD: Mark Spec as Ready` | Transition spec from draft → ready (validation must pass) |
| `SDD: Execute Spec` | Assemble context and run Claude CLI against a ready spec |
| `SDD: Review Spec` | Open split view: spec + diff (available for `in_progress` and `review` specs) |
| `SDD: Approve Spec` | Mark review as approved → status → `done` |
| `SDD: Request Changes` | Write feedback → appended to spec Context → status → `ready` for re-execution |
| `SDD: Reject Spec` | Revert agent changes via `git checkout` → status → `draft` |
| `SDD: Open AI Config` | Configure provider, model, permission mode, tag-skill mappings, and git/PR commands |
| `SDD: Open Kanban Board` | Open the 5-column visual kanban board |
| `SDD: Open Dashboard` | Open project analytics: spec counts, cost charts, scope estimate |

---

## Configuration

Settings available under **SDD Platform** in VS Code preferences:

| Setting | Default | Description |
|---|---|---|
| `sdd.specPrefix` | `SPEC` | Prefix for auto-generated spec IDs (e.g., `PROJ`, `SDD`) |
| `sdd.testCommand` | `npm test` | Command run after execution for auto-validation |
| `sdd.claudeCliBinary` | `claude` | Path to Claude CLI binary |
| `sdd.defaultBudget` | `100000` | Default `budget_max_tokens` for new specs |
| `sdd.autoValidate` | `true` | Automatically run test command after execution |

AI-specific settings are stored in `.sdd/ai-config.json` and managed through `SDD: Open AI Config`:

| Setting | Description |
|---|---|
| `provider` | AI provider (e.g., `anthropic`) |
| `model` | Model ID |
| `permissionMode` | What the agent is allowed to do autonomously |
| `tagSkillMappings` | Array of `{ tag, skillFile }` pairs — overrides `agent_skills` when a spec's tag matches |
| `commitCommand` | Shell command for git commit; supports `{spec_id}` and `{title}` placeholders |
| `commitCommandEnabled` | Whether to inject the commit command into the agent's context |
| `prCommand` | Shell command for PR creation; supports `{spec_id}` and `{title}` placeholders |
| `prCommandEnabled` | Whether to inject the PR command into the agent's context |

---

## Data Storage

All state is file-based and version-controlled — no database, no server, no account required:

```
your-project/
├── .specs/                             # Spec files (source of truth)
│   └── PROJ-042-password-reset.sdd.md
├── .sdd/
│   ├── config.json                     # Project settings
│   ├── ai-config.json                  # AI provider, model, permission mode, git commands
│   ├── conventions.md                  # Agent conventions injected into every execution
│   ├── executions/
│   │   └── PROJ-042/
│   │       ├── exec-001.json           # Tokens, cost, status, duration, changed files
│   │       └── exec-001.log            # Full execution log
│   └── reviews/
│       └── PROJ-042/
│           └── review-001.json         # Reviewer decision + feedback
```

Every spec, execution, and review lives in Git history. Clone the repo and you get the full SDD audit trail — what was built, when, by which agent, at what cost, and what feedback it received.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript + VS Code Extension API |
| Bundler | esbuild |
| Webview UI | Svelte + Vite |
| Spec format | YAML frontmatter + Markdown |
| Validation | Ajv (JSON Schema) |
| AI execution | Claude CLI |
| Version control | Git CLI + gh CLI |
| Testing | Vitest + @vscode/test-electron |

---

## Building from Source

```bash
npm install

# Build the VS Code extension (esbuild)
npm run build

# Build webview assets — Svelte components compiled by Vite into dist/webviews/
npm run build:webview

# Type-check all extension TypeScript
npm run type-check

# Run tests
npm test
```

The extension build (`npm run build`) and the webview build (`npm run build:webview`) are independent pipelines — esbuild for Node/extension code, Vite+Svelte for browser webview code.

---

## Feedback & Issues

Report bugs and feature requests at [GitHub Issues](https://github.com/your-org/sdd-platform/issues).

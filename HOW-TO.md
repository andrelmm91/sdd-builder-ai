# Builder AI — How-To Guide

**An SDD-inspired VS Code extension: turn structured specs into working code via AI agents.**

Builder AI brings a governed, repeatable workflow for AI-assisted development right into VS Code. Inspired by Spec-Driven Development (SDD) principles, you write small, precise spec files that tell the AI agent exactly what to build, which files to touch, and what "done" looks like. The agent executes, you review, and you ship — all without leaving your editor.

**Bring Your Own Key (BYOK)** — Builder AI does not manage AI subscriptions or API keys. It orchestrates external CLI tools (Claude CLI, GitHub Copilot CLI) that you install and authenticate independently. You use your own accounts, your own keys, and your own billing — the extension simply assembles context and delegates execution to whichever CLI you have configured.

---

## How It Works

```
Add Feature Ideas → Idealize with AI → Generate SDD Specs → Review & Refine → Execute (Claude CLI) → Review Diff → Ship PR
```

Start by adding feature ideas to the **Requirement Board**, where AI idealizes your raw ideas into structured requirements and then decomposes them into `.sdd.md` **spec files**. Each spec is a small, independently executable contract with a clear scope (one thing, two days development, ≤ 3 files), structured requirements, acceptance criteria, and an explicit list of relevant files so the agent has all the context it needs without guessing.

Because specs are plain markdown files, everything is version-controlled. Your entire development history — requirements, idealizations, executions, reviews, feedback — lives in Git alongside your code.

---

## Features

### Spec Authoring

**Templates** — Start a new spec in seconds with `SDD: New Spec from Template`. Choose from Feature, Bug Fix, or Refactor templates that pre-fill the right sections for each type of work.

**Structured form** — Rather than editing raw markdown, use `SDD: New Spec Form` to fill in a guided UI with fields for every frontmatter property and each body section. The form compiles to a valid `.sdd.md` on save.

**File path IntelliSense** — When editing `relevant_files` or `must_not_touch` in a spec, the extension autocompletes workspace-relative file paths. No more typos in file references.

**Live validation** — The extension validates specs on save, showing inline errors (red squiggles) and Problems panel entries for things like missing required fields, too many files in scope, or unknown status values.

### Requirement Board

**Feature idealization pipeline** — The Requirement Board (`SDD: Open Requirement Board`) provides a three-column kanban for managing feature ideas from raw input through AI-assisted idealization to SDD spec generation:

| Column | Purpose |
|---|---|
| **Feature Backlog** | Add feature ideas with a form (name, description, acceptance criteria, notes) |
| **Idealization In Review** | Click **Idealize Requirements** to invoke AI and generate a structured idealization document |
| **SDD Created** | Click **Create SDD Cards** to generate multiple `.sdd.md` spec files from the idealization |

Feature data is stored in `.sdd/product/{feature_name}/` directories. The Requirement Board has its own AI configuration (provider, model, prompt templates) independent from the SDD execution config, configurable in `SDD: Open AI Config`.

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

**Requirement board** — `SDD: Open Requirement Board` provides a three-column board for managing feature ideas through the idealization pipeline (Feature Backlog → Idealization In Review → SDD Created).

**Dashboard** — `SDD: Open Dashboard` gives you a project overview: spec counts by status, completion percentage, recent activity, and token usage charts — so you always know where the project stands. The dashboard hot-reloads when specs are added or modified.

### Execution

**Claude CLI execution** — When you execute a spec, the extension assembles a full context package (spec file + relevant file contents + conventions + agent skills), injects it into Claude CLI, and streams output to a dedicated terminal. You can watch the agent work in real time.

**Config-aware pipeline** — The execution pipeline reads your AI Config at runtime to apply the right provider, model, permission mode, and tag-to-skill mappings. A spec tagged `backend` can automatically use a different agent persona than one tagged `frontend`.

**Token budget enforcement** — Each spec declares a `budget_max_tokens` limit. The execution pipeline enforces this ceiling so no single spec burns through your budget unexpectedly.

**Post-execution validation** — After execution completes, the extension automatically runs your configured test command (e.g., `npm test`) and captures the results alongside the execution record.

**Bulk execution** — In the Kanban board, use `[+ Bulk]` to queue multiple Ready specs, then `[Execute All]` to run them sequentially. Selected specs are grouped in a visual frame with real-time progress: a loading spinner on the current spec, checkmarks for completed, and X marks for failed. Specs execute in dependency order and cards move through columns as status changes.

### Review

**Split-view review** — When a spec moves to Review, click it to open a split view: the spec on the left (requirements, acceptance criteria), the multi-file diff on the right, and an execution summary at the bottom (tokens, duration, test results, list of changed files).

Review cards in the Kanban board show a collapsible changed-files list inline — green for added, yellow for modified, red for deleted — so you can triage at a glance without opening the full review. Changed files are persisted in execution records for reliable display.

From the review view you have three choices:

| Action | What happens |
|---|---|
| **Approve** | Spec status moves to `done`. Git/PR operations are handled by the agent if you configured post-execution commands. |
| **Request Changes** | An in-kanban modal pre-populates feedback with acceptance criteria as a checklist. Feedback is appended to the spec's `## Context` section and status resets to `ready`. Optionally re-execute immediately. |

### AI Config

**`SDD: Open AI Config`** — A dedicated settings panel for everything AI-related:

- **Provider & Model** — Select your AI provider (Claude CLI, Copilot CLI) and model ID. Uses whichever CLI you have installed and authenticated — no API keys are stored by the extension.
- **Permission Mode** — Control what the agent is allowed to do autonomously.
- **Tag-to-Skill Mappings** — Map spec tags to agent persona files. When a spec has a matching tag, the mapped skill file is injected instead of the spec's default `agent_skills` value.
- **Post-Execution Commands** — Enable a commit command and/or PR command that the agent runs automatically after implementation. Use `{spec_id}` and `{title}` as placeholders:

```bash
# Commit command
git add -A && git commit -m "feat: {title} ({spec_id})"

# PR command
gh pr create --title "{title}" --body "Closes {spec_id}"
```

**Requirements AI Config** — The Requirement Board commands (Idealize Requirements, Create SDD Cards) have their own AI configuration section with separate provider, model, permission mode, and customizable prompt templates for each command.

AI Config is stored in `.sdd/ai-config.json` and version-controlled with your project.

### Tracking & Estimation

**Token tracking** — Every execution saves a record to `.sdd/executions/{SPEC_ID}/exec-NNN.json` with token usage, duration, status, and the list of changed files. Token usage charts appear in the dashboard, which hot-reloads when specs are added or modified.

**Scope estimation** — `SDD: Open Dashboard` includes a scope estimate: spec count broken down by complexity (low / medium / high) and grouped by phase or area tag, so you can communicate rough effort before you start executing.

### Onboarding

**Getting Started walkthrough** — On first activation (when no `.sdd/config.json` exists), the native VS Code "Getting Started with Builder AI" walkthrough opens automatically. It walks you through initialization, creating your first spec, marking it ready, executing it, and reviewing the output — one step at a time with links to the exact commands.

---

## Requirements

- VS Code 1.85+
- **AI CLI (BYOK)** — Install and authenticate one of the following with your own account:
  - [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) — Anthropic's command-line tool
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) — GitHub's AI assistant
- Git configured in the workspace
- [gh CLI](https://cli.github.com/) (for GitHub integration)

> **Note:** Builder AI does not include or manage AI API keys. You bring your own CLI tools, already authenticated with your own subscription or API key. All AI costs are billed directly by your provider — the extension has no access to your credentials.

---

## Getting Started

### 1. Install the Extension

Search for **Builder AI** in the VS Code Extensions panel, or install via:

```
ext install builder-ai
```

On first activation the **Getting Started with Builder AI** walkthrough opens automatically, guiding you through each step below.

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
│   ├── product/         # Feature idealization data (managed by Requirement Board)
│   └── skills/
│       └── sdd-planner.md   # Default AI planner persona
```

The `conventions.md` file is especially important — anything you write here (naming conventions, architecture rules, preferred libraries) gets injected into every agent execution, so the AI builds to your standards from the start.

### 3. Configure AI Settings

Run `SDD: Open AI Config` to choose your provider and model, set the permission mode, and optionally configure tag-to-skill mappings and post-execution git/PR commands.

### 4. Add Feature Ideas

Open `SDD: Open Requirement Board` to add feature ideas. Fill in a name, description, acceptance criteria, and notes. Then:

1. **Idealize** — Click "Idealize Requirements" to have AI generate a structured idealization document from your raw feature idea.
2. **Generate Specs** — Click "Create SDD Cards" to decompose the idealization into individual `.sdd.md` spec files in `.specs/`.

Alternatively, run `SDD: Plan Specs from Requirements` to describe what you want in plain English and let the SDD Planner agent decompose it into specs directly.

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
| `SDD: Open Requirement Board` | Open the 3-column feature idealization board |
| `SDD: Idealize Requirements` | AI-powered idealization of a feature into structured requirements |
| `SDD: Create SDD Cards` | AI-powered generation of SDD spec files from an idealization |
| `SDD: Open Dashboard` | Open project analytics: spec counts, token charts, scope estimate |

---

## Configuration

Settings available under **Builder AI** in VS Code preferences:

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

Requirements AI settings (separate from SDD execution config):

| Setting | Description |
|---|---|
| `requirementsAi.provider` | AI provider for requirement board commands |
| `requirementsAi.model` | Model ID for requirement board commands |
| `requirementsAi.permissionMode` | Permission mode for requirement board commands |
| `requirementsAi.idealizePromptTemplate` | Customizable prompt template for the Idealize Requirements command |
| `requirementsAi.createSddCardsPromptTemplate` | Customizable prompt template for the Create SDD Cards command |

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
│   ├── product/                        # Feature idealization data
│   │   └── password-reset/
│   │       ├── feature.json            # Feature metadata and status
│   │       └── idealization.md         # AI-generated structured requirements
│   ├── executions/
│   │   └── PROJ-042/
│   │       ├── exec-001.json           # Tokens, status, duration, changed files
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

Report bugs and feature requests at [GitHub Issues](https://github.com/your-org/builder-ai/issues).

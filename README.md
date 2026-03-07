# SDD Platform — VS Code Extension

**Spec-Driven Development: turn structured specs into working code via AI agents.**

SDD Platform is a VS Code extension that gives you a governed, repeatable workflow for AI-assisted development. You write specs, AI executes them, you review the diff, and ship to GitHub — all without leaving your editor.

---

## Core Loop

```
Describe Requirements → AI Plans Specs → Review & Refine → Execute (Claude CLI) → Review Diff → Ship PR
```

Each unit of work is a `.sdd.md` spec file — a small, independently executable contract that tells the AI agent exactly what to build, which files to touch, and what "done" looks like.

---

## Features

### Free Tier

| Feature | Description |
|---|---|
| Spec templates | Generate new `.sdd.md` files from Feature / Bug Fix / Refactor templates |
| Spec validation | On-save validation with red squiggles and Problems panel integration |
| Lifecycle management | Draft → Ready → In Progress → Review → Done status transitions |
| AI planning | Describe requirements in plain language; AI decomposes into a set of specs with dependencies |
| Claude CLI execution | Execute specs via Claude CLI in the integrated terminal with real-time streaming |
| Sidebar tree view | Browse all specs grouped by status with icons and quick actions |
| Review flow | Side-by-side spec + multi-file diff view; approve or request changes |
| GitHub integration | Auto branch, commit, and PR creation via `git` and `gh` CLI |
| Cost tracking | Per-spec token usage and cost stored in `.sdd/executions/` |
| Project initialization | `SDD: Initialize Project` scaffolds `.sdd/`, `.specs/`, conventions, and skills files |

### Pro Tier ($12/month)

| Feature | Description |
|---|---|
| **Kanban board** | Visual 5-column board (Draft → Done) with action buttons on cards, drag-and-drop, search/filter, and a "New Spec +" button |
| **Spec form** | Structured UI for all frontmatter fields and all markdown body sections — create or edit specs without touching raw markdown |
| **Dashboard** | Project overview: spec counts by status, completion %, recent activity, cost charts |
| **Scope estimation** | Aggregate spec count × complexity breakdown per phase/area tag |
| **Multi-project support** | Multiple `.sdd/` configs in a single workspace |
| **Custom agent skills** | Create unlimited persona files for different agent roles |

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

### 2. Initialize a Project

Open your project in VS Code and run:

```
SDD: Initialize Project
```

This creates:

```
your-project/
├── .specs/              # Where your spec files live
├── .sdd/
│   ├── config.json      # Project settings (prefix, test command)
│   ├── conventions.md   # Code conventions injected into agent context
│   └── skills/
│       └── sdd-planner.md   # Default AI planner persona
```

The extension runs a health check to verify Claude CLI, `gh`, and Git are available.

### 3. Plan Your Specs

Run `SDD: Plan Specs from Requirements` and describe what you want to build in natural language:

```
Add user authentication with email/password login, password reset, and session management
```

The SDD Planner agent decomposes your requirements into a set of `.sdd.md` spec files in `.specs/`, with sequential IDs, dependency links, and relevant file lists pre-filled.

### 4. Review and Refine

Generated specs open in the editor. Browse them in the sidebar under "Draft". You can:
- Edit any spec to adjust scope or acceptance criteria
- Delete specs you don't want
- Re-run the planner with feedback: `SDD: Refine Plan`

When a spec is ready, run `SDD: Mark Spec as Ready` (or use the sidebar action). Validation must pass first.

### 5. Execute

Right-click a **Ready** spec in the sidebar → **Execute Spec**, or run `SDD: Execute Spec`.

The extension:
1. Assembles context: spec + relevant file contents + conventions + agent skills
2. Spawns Claude CLI in a dedicated terminal
3. Sets spec status to `in_progress`
4. After completion: captures `git diff`, token usage, and runs your test command

### 6. Review the Output

When execution completes, the spec moves to **Review**. Click it in the sidebar to open split view:

- **Left:** the spec (requirements, acceptance criteria)
- **Right:** multi-file diff of everything the agent changed
- **Bottom:** execution summary (tokens, duration, test results)

Then choose:

| Action | Result |
|---|---|
| **Approve** | Status → `done`, proceeds to GitHub flow |
| **Request Changes** | Write feedback → status back to `ready` → re-execute with feedback included |
| **Reject** | Status → `draft`, agent changes reverted via `git checkout` |

### 7. Ship to GitHub

After approval, the extension automatically:

```bash
git checkout -b sdd/PROJ-043-password-reset
git add <changed files>
git commit -m "feat: add password reset flow (PROJ-043)"
git push -u origin sdd/PROJ-043-password-reset
gh pr create --title "..." --body "<spec summary>"
```

The PR URL is saved to the execution record and shown in the sidebar.

---

## Kanban Board (Pro)

Open with `SDD: Open Kanban Board`.

- All 5 status columns visible simultaneously
- Cards show: spec_id, title, complexity badge, priority badge, tag chips
- **Action buttons on cards** based on status:
  - Draft → `[Mark Ready]`
  - Ready → `[Execute]`
  - Review → `[Approve]` `[Request Changes]`
- **"New Spec +"** button in the header → opens the Spec Form in Create mode
- **Search/filter bar** — filter by spec_id, title, or tag in real-time
- **Drag cards** between adjacent valid columns to transition status

---

## Spec Form (Pro)

Opens in Create mode from the Kanban "New Spec +" button, or in Edit mode by right-clicking a spec in the sidebar.

Form sections:

| Group | Fields |
|---|---|
| Identity | spec_id (auto-generated), title, status, priority, complexity |
| Classification | tags (chip input), agent_skills |
| Scope | relevant_files, must_not_touch, depends_on (multi-select) |
| Budget | budget_max_tokens (number + slider) |
| Body | Context, Requirements (Functional + Non-Functional), Acceptance Criteria (Automated + Manual), Constraints, Examples |

Saving compiles the form into a valid `.sdd.md` file and writes it to `.specs/`.

---

## Spec File Format

Every spec is a `.sdd.md` file with YAML frontmatter and markdown body sections:

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
What this spec addresses and why.

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

**Hard constraints per spec (enforced by validation):**
- Maximum 3 files to create/edit (excluding tests)
- Single responsibility — one spec does one thing
- Must be completable in ≤ 1 day
- `relevant_files` provides all context for the agent; `must_not_touch` protects files from modification

**Status lifecycle:** `draft → ready → in_progress → review → done`

---

## Commands

| Command | Description |
|---|---|
| `SDD: Initialize Project` | Scaffold `.sdd/` and `.specs/` folders, health check |
| `SDD: New Spec from Template` | Generate a spec from Feature / Bug Fix / Refactor template |
| `SDD: Plan Specs from Requirements` | AI decomposes natural language requirements into specs |
| `SDD: Validate Current Spec` | Manually trigger validation on the open spec file |
| `SDD: Mark Spec as Ready` | Transition spec from draft → ready (validation must pass) |
| `SDD: Execute Spec` | Run Claude CLI against a ready spec |
| `SDD: Review Spec` | Open split view: spec + diff (available for `in_progress` and `review` specs) |
| `SDD: Approve Spec` | Approve review and proceed to GitHub flow |
| `SDD: Request Changes` | Write feedback and send spec back for re-execution |
| `SDD: Reject Spec` | Revert agent changes and transition spec back to `draft` |
| `SDD: Open Dashboard` | Open project analytics webview (Pro) |
| `SDD: Open Kanban Board` | Open the 5-column kanban webview (Pro) |
| `SDD: New Spec Form` | Open structured spec form in create mode (Pro) |

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

---

## Data Storage

All state is file-based and version-controlled — no database, no server:

```
your-project/
├── .specs/                             # Spec files (source of truth)
│   └── PROJ-042-password-reset.sdd.md
├── .sdd/
│   ├── config.json                     # Project settings
│   ├── conventions.md                  # Agent conventions
│   ├── executions/
│   │   └── PROJ-042/
│   │       ├── exec-001.json           # Tokens, cost, status, duration
│   │       └── exec-001.log            # Full execution log
│   └── reviews/
│       └── PROJ-042/
│           └── review-001.json         # Reviewer decision + feedback
```

Every spec, execution, and review lives in Git history — clone the repo and get the full SDD audit trail.

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

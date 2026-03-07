# SDD Platform — VS Code Extension

> The SDD Platform delivers structured, spec-driven AI development as a VS Code extension. Builders author specs, execute them via Claude CLI, review diffs, and ship to GitHub — all without leaving their editor. This document covers the MVP architecture, development plan, and monetization strategy.

---

## 1. Product Vision

**SDD is a VS Code extension that turns structured specifications into working code via AI agents.**

Instead of building a cloud SaaS with its own frontend, backend, database, and hosting infrastructure, the extension leverages what VS Code already provides: a markdown editor, integrated terminal, diff viewer, Git integration, file explorer, and an extension marketplace with built-in distribution.

**Target user:** Vibe coders — developers who blend product thinking with hands-on coding and want AI to handle implementation grunt work within a governed, repeatable process.

**Core loop:**
```
Describe Requirements → AI Plans Specs (.sdd.md) → Builder Reviews & Refines → Execute (Claude CLI) → Review (VS Code diff) → Ship (GitHub PR)
```

---

## 2. MVP Feature Mapping

All original SDD capabilities preserved, mapped to VS Code primitives.

### Spec Management

| Capability | Implementation |
|---|---|
| Spec CRUD | `.sdd.md` files in a `.specs/` folder within the project repo |
| Spec templates (feature, bug fix, refactor) | Extension command: "SDD: New Spec from Template" → generates pre-filled markdown |
| Spec versioning (immutable snapshots) | Git commits — each "Mark as Ready" creates a tagged commit |
| Spec validation (required fields, dependencies) | On-save validation with VS Code diagnostics (red squiggles, Problems panel) |
| Spec lifecycle (Draft → Ready → In Progress → Review → Done) | YAML frontmatter `status:` field, updated via commands or sidebar actions |
| Phase and area tags | YAML frontmatter `tags:` array, filterable in sidebar |
| Human-readable spec IDs | YAML frontmatter `spec_id:` (e.g., PROJ-042), auto-generated from project prefix + counter |

### Spec Format

```yaml
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
Summary of what this spec addresses and why.

## Requirements
### Functional
- User can request password reset via email
- Reset link expires after 1 hour

### Non-Functional
- Rate limit: max 3 reset requests per hour per email

## Acceptance Criteria
### Automated
- [ ] Unit tests pass for reset token generation
- [ ] Integration test for full reset flow

### Manual
- [ ] Reset email contains correct link format
- [ ] Expired tokens return appropriate error

## Constraints
- Must use existing email service (Resend)
- Must not modify OAuth flow

## Examples
Input: POST /auth/reset {email: "user@example.com"}
Output: 200 {message: "Reset email sent"}
```

### Planning (AI-Assisted Spec Generation)

| Capability | Implementation |
|---|---|
| Requirements-to-specs decomposition | Builder describes requirements in natural language; AI agent decomposes into multiple `.sdd.md` spec files |
| SDD Planner agent | Claude CLI invoked with `.sdd/skills/sdd-planner.md` — a specialized persona that understands the SDD spec format, project context, and decomposition principles |
| Context for planning | Extension feeds the planner: requirements input + repo file tree + existing specs + project conventions + spec templates |
| Output: spec batch | Planner generates N spec files in `.specs/` with proper frontmatter, sequential IDs, tags, dependency links, and relevant_files |
| Builder review of plan | Generated specs open in editor for builder to review, edit, reorder, or discard before marking any as ready |
| Iterative refinement | Builder can re-run planner with feedback ("split this spec further", "merge these two", "add acceptance criteria for X") |
| Dependency linking | Planner auto-populates `depends_on:` frontmatter field to express execution order between generated specs |
| Scope estimation | After planning, dashboard shows total spec count, complexity distribution, and estimated token budget for the full plan |

### Execution

| Capability | Implementation |
|---|---|
| Context assembly (spec + files + conventions) | Extension reads spec, gathers `relevant_files`, loads `.sdd/conventions.md` from project root |
| Claude CLI execution with streaming | Spawns Claude CLI in VS Code integrated terminal via Terminal API |
| Sandbox/scope enforcement | Pre-execution warning if spec has `must_not_touch` files; post-execution check for out-of-scope changes |
| Per-spec budget limits | Passes `--max-tokens` flag to Claude CLI; parses output for token usage |
| Agent persona/skills config | Loads skills file from `.sdd/skills/{agent_skills}.md` and injects into context |
| Execution job queue | Sequential execution — one spec at a time (MVP simplicity) |
| Auto-validation (tests, lint) | Post-execution: runs `npm test` / configured test command in terminal, captures pass/fail |
| Execution cost tracking | Parses Claude CLI output for token counts, stores in `.sdd/executions.json` |
| Real-time streaming logs | Native — Claude CLI streams directly in VS Code terminal |

### Review

| Capability | Implementation |
|---|---|
| Review queue | Sidebar section: "Specs in Review" — click to open review |
| Side-by-side spec vs output | Command: "SDD: Review Spec" opens split view — spec on left, multi-file diff on right |
| Inline commenting | VS Code native: comments via CodeLens or a lightweight annotation system stored in `.sdd/reviews/` |
| Approve / Request Changes / Reject | Quick pick menu or Webview buttons; updates spec status in frontmatter |
| Feedback → re-execution loop | On "Request Changes": builder writes feedback in review file, extension re-assembles context with feedback included |

### GitHub Integration

| Capability | Implementation |
|---|---|
| Create branch | Shells out to `git checkout -b sdd/{spec_id}-{slug}` |
| Commit changes | `git add` + `git commit` with auto-generated message from spec title |
| Open PR | Shells out to `gh pr create` with spec summary as PR body |
| Link PR back to spec | Stores PR URL in `.sdd/executions.json` |
| Detect merge | Polls `gh pr view` or watches git state |

### Dashboard & Analytics

| Capability | Implementation |
|---|---|
| Project overview | Webview panel: spec counts by status, completion %, recent activity |
| Cost summary | Webview panel: total tokens, cost per spec, cost trend chart |
| Scope estimation | Calculated from spec count x complexity per phase/area tag |
| Kanban board | Webview panel with all 5 status columns (Draft, Ready, In Progress, Review, Done); contextual action buttons on cards per status (Mark Ready / Execute / Approve + Request Changes); "New Spec +" button in header opens Spec Form panel; search/filter bar by spec_id, title, or tag; drag-and-drop with lifecycle validation |
| Spec form | Webview panel with structured fields for all frontmatter fields AND all markdown body sections (Context, Requirements – Functional/Non-Functional, Acceptance Criteria – Automated/Manual, Constraints, Examples); Create mode (auto-generates spec_id, triggered from Kanban) and Edit mode (loads existing file); Save compiles to valid `.sdd.md` written to `.specs/` |

### Onboarding

| Capability | Implementation |
|---|---|
| First-time setup | Command: "SDD: Initialize Project" → creates `.sdd/` folder, `.specs/` folder, conventions template, example spec |
| Guided first spec | Walkthrough API (VS Code native) — step-by-step guide with highlighted UI elements |
| Health check | Verify Claude CLI installed, `gh` CLI available, Git configured |

---

## 3. Architecture

### High-Level

```
┌─────────────────────────────────────────────────────────┐
│                      VS Code                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  SDD Sidebar │  │  Spec Editor │  │  VS Code      │  │
│  │  (TreeView)  │  │  (Markdown)  │  │  Terminal     │  │
│  │              │  │              │  │               │  │
│  │ - Specs by   │  │ - .sdd.md    │  │ - Claude CLI  │  │
│  │   status     │  │   files      │  │   execution   │  │
│  │ - Actions    │  │ - Validation │  │ - Git / gh    │  │
│  │ - Quick info │  │   diagnostics│  │   commands    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Webview:    │  │  Diff View   │  │  Output       │  │
│  │  Dashboard   │  │  (native)    │  │  Channel      │  │
│  │  Kanban      │  │              │  │               │  │
│  │  Spec Form   │  │ - Review     │  │ - Logs        │  │
│  │              │  │   diffs      │  │ - Validation  │  │
│  │              │  │ - Approve /  │  │   results     │  │
│  │              │  │   reject     │  │              ,│  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Extension Core (TypeScript)           │ │
│  │                                                    │ │
│  │  SpecParser → Validator → Planner (sdd-planner) →  │ │
│  │  ContextAssembler → ExecutionRunner →              │ │
│  │  ResultCapture → ReviewManager →                   │ │
│  │  GitHubIntegration → CostTracker                   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
          │                    │                  │
          ▼                    ▼                  ▼
    Claude CLI            Git / gh CLI      Project Files
   (AI execution)     (version control)    (.sdd.md specs)
```

### Data Storage (No Database)

All state lives in the project repository as files:

```
project-repo/
├── .sdd/                          # SDD configuration and state
│   ├── config.json                # Project settings (prefix, test command, conventions path)
│   ├── conventions.md             # Project conventions (injected into agent context)
│   ├── executions/                # Execution records
│   │   └── PROJ-042/
│   │       ├── exec-001.json      # {timestamp, tokens_in, tokens_out, cost, status, duration}
│   │       ├── exec-001.log       # Full execution log
│   │       └── exec-002.json      # Re-execution after feedback
│   └── reviews/                   # Review records
│       └── PROJ-042/
│           └── review-001.md      # Reviewer feedback and decision
│
├── .claude/                         # (Optional) Claude CLI config, if we want to manage it from the extension
│    └── skills/                    # Agent persona files
│       ├── sdd-planner
│       │   └── SKILL.md 
│       ├── backend-dev
│           └── SKILL.md
├── .specs/                         # Spec files (the source of truth)
│   ├── PROJ-040-user-login.sdd.md
│   ├── PROJ-041-api-rate-limit.sdd.md
│   └── PROJ-042-password-reset.sdd.md
│
├── src/                           # Project source code
└── ...
```

**Why file-based:**
- Zero infrastructure — no database, no server
- Version controlled — every spec, execution, and review is in Git history
- Portable — clone the repo, get the full SDD history
- Inspectable — all state is human-readable markdown and JSON

---

## 4. Extension Folder Structure

```
sdd-vscode/
├── src/
│   ├── extension.ts                    # Activation, command/view registration
│   │
│   ├── .specs/
│   │   ├── parser.ts                   # Parse .sdd.md → structured SpecData object
│   │   ├── validator.ts                # Validate required fields, frontmatter schema
│   │   ├── diagnostics.ts              # VS Code DiagnosticCollection for spec errors
│   │   ├── templates.ts                # Generate new spec files from templates
│   │   ├── lifecycle.ts                # State machine: status transitions + guards
│   │   ├── specIdGenerator.ts          # Auto-increment spec IDs (PREFIX-NNN)
│   │   └── types.ts                    # SpecData, SpecStatus, SpecTemplate types
│   │
│   ├── planning/
│   │   ├── planner.ts                  # Orchestrate planning flow: input → Claude CLI → spec files
│   │   ├── requirementsParser.ts       # Parse builder's requirements input (free text or structured)
│   │   ├── planContextAssembler.ts     # Build planner context: requirements + repo tree + conventions + templates
│   │   ├── specBatchWriter.ts          # Write generated specs to .specs/ with sequential IDs
│   │   ├── dependencyResolver.ts       # Validate and order depends_on links between generated specs
│   │   └── types.ts                    # PlanningRequest, PlanningResult, RequirementsInput types
│   │
│   ├── execution/
│   │   ├── contextAssembler.ts         # Build full context: spec + files + conventions + feedback
│   │   ├── runner.ts                   # ExecutionRunner interface
│   │   ├── cliRunner.ts               # Claude CLI execution via Terminal API
│   │   ├── resultCapture.ts            # Parse execution output: diffs, tokens, errors
│   │   ├── budgetEnforcer.ts           # Token limit checks, abort on exceed
│   │   ├── skillsLoader.ts             # Load and inject skills.md into context
│   │   ├── postValidation.ts           # Run tests/lint after execution, capture results
│   │   └── types.ts                    # ExecutionRecord, LogEvent, Artifact types
│   │
│   ├── review/
│   │   ├── reviewManager.ts            # Open review flow: diff view + decision UI
│   │   ├── diffProvider.ts             # Multi-file diff using VS Code SCM diff API
│   │   ├── feedbackWriter.ts           # Save reviewer feedback to .sdd/reviews/
│   │   └── types.ts                    # ReviewDecision, ReviewComment types
│   │
│   ├── github/
│   │   ├── gitOps.ts                   # Branch creation, staging, committing
│   │   └── prCreator.ts               # gh pr create with spec-derived content
│   │
│   ├── analytics/
│   │   ├── costTracker.ts              # Accumulate token/cost data from execution records
│   │   └── scopeEstimator.ts           # Spec count x complexity aggregation
│   │
│   ├── views/
│   │   ├── sidebar/
│   │   │   ├── specTreeProvider.ts     # TreeDataProvider: specs grouped by status
│   │   │   ├── specTreeItem.ts         # TreeItem with icons, context menu, status badges
│   │   │   └── executionTreeProvider.ts # Recent executions tree
│   │   │
│   │   └── webviews/
│   │       ├── dashboard/
│   │       │   ├── DashboardPanel.ts   # Webview panel controller
│   │       │   └── app/                # Lightweight frontend (Svelte or vanilla)
│   │       │       ├── Dashboard.svelte
│   │       │       └── index.ts
│   │       ├── kanban/
│   │       │   ├── KanbanPanel.ts
│   │       │   └── app/
│   │       │       ├── Kanban.svelte
│   │       │       └── index.ts
│   │       └── specForm/
│   │           ├── SpecFormPanel.ts    # Structured spec editor (alternative to raw markdown)
│   │           └── app/
│   │               ├── SpecForm.svelte
│   │               └── index.ts
│   │
│   ├── config/
│   │   ├── projectConfig.ts            # Read/write .sdd/config.json
│   │   └── extensionConfig.ts          # VS Code settings (sdd.* namespace)
│   │
│   └── utils/
│       ├── fileSystem.ts               # Workspace file read/write helpers
│       ├── frontmatter.ts              # YAML frontmatter parse/serialize
│       ├── shell.ts                    # Child process / terminal helpers
│       └── constants.ts                # File patterns, default values
│
├── webview-ui/                         # Shared webview assets (if using a build step)
│   ├── src/
│   ├── public/
│   └── vite.config.ts                  # Build webviews with Vite
│
├── media/                              # Icons, images
│   ├── sdd-icon.svg
│   ├── spec-draft.svg
│   ├── spec-ready.svg
│   ├── spec-done.svg
│   └── logo.png
│
├── test/
│   ├── .specs/parser.test.ts
│   ├── .specs/validator.test.ts
│   ├── execution/contextAssembler.test.ts
│   └── fixtures/                       # Sample .sdd.md files for testing
│
├── .vscode/
│   └── launch.json                     # Extension debug configuration
├── .vscodeignore                       # Files excluded from packaged extension
├── package.json                        # Extension manifest (contributes, activationEvents)
├── tsconfig.json
├── vite.config.ts                      # Build config for webviews
├── esbuild.config.mjs                  # Build config for extension code
└── README.md
```

---

## 5. Extension Manifest (package.json key sections)

```jsonc
{
  "name": "sdd-platform",
  "displayName": "SDD Platform",
  "description": "Spec-Driven Development — turn structured specs into working code via AI agents",
  "categories": ["AI", "Other"],
  "activationEvents": [
    "workspaceContains:**/*.sdd.md",
    "workspaceContains:.sdd/config.json"
  ],
  "contributes": {
    "commands": [
      { "command": "sdd.initProject",      "title": "SDD: Initialize Project" },
      { "command": "sdd.newSpec",           "title": "SDD: New Spec from Template" },
      { "command": "sdd.planFromRequirements", "title": "SDD: Plan Specs from Requirements" },
      { "command": "sdd.validateSpec",      "title": "SDD: Validate Current Spec" },
      { "command": "sdd.markReady",         "title": "SDD: Mark Spec as Ready" },
      { "command": "sdd.executeSpec",       "title": "SDD: Execute Spec" },
      { "command": "sdd.reviewSpec",        "title": "SDD: Review Spec" },
      { "command": "sdd.approveSpec",       "title": "SDD: Approve & Create PR" },
      { "command": "sdd.requestChanges",    "title": "SDD: Request Changes" },
      { "command": "sdd.openDashboard",     "title": "SDD: Open Dashboard" },
      { "command": "sdd.openKanban",        "title": "SDD: Open Kanban Board" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "sdd-explorer", "title": "SDD", "icon": "media/sdd-icon.svg" }
      ]
    },
    "views": {
      "sdd-explorer": [
        { "id": "sdd.specTree",       "name": "Specs" },
        { "id": "sdd.executionTree",  "name": "Executions" },
        { "id": "sdd.quickActions",   "name": "Quick Actions", "type": "webview" }
      ]
    },
    "configuration": {
      "title": "SDD Platform",
      "properties": {
        "sdd.specPrefix":        { "type": "string",  "default": "SPEC",  "description": "Prefix for auto-generated spec IDs" },
        "sdd.testCommand":       { "type": "string",  "default": "npm test", "description": "Command to run after execution for validation" },
        "sdd.claudeCliBinary":   { "type": "string",  "default": "claude", "description": "Path to Claude CLI binary" },
        "sdd.defaultBudget":     { "type": "number",  "default": 100000, "description": "Default max tokens per execution" },
        "sdd.autoValidate":      { "type": "boolean", "default": true,   "description": "Automatically run tests after execution" }
      }
    },
    "languages": [
      { "id": "sdd-spec", "extensions": [".sdd.md"], "aliases": ["SDD Spec"] }
    ]
  }
}
```

---

## 6. Core User Flows (VS Code Adapted)

### Flow 1: Project Initialization

```
Developer installs SDD extension from VS Code Marketplace
    │
    ├── Opens a project in VS Code
    ├── Runs "SDD: Initialize Project" from command palette
    │
    ├──▶ Extension creates:
    │    ├── .specs/                     (spec files folder)
    │    ├── .sdd/config.json           (project config with prefix, test command)
    │    ├── .sdd/conventions.md        (conventions template, pre-filled from repo analysis)
    │    └── .sdd/skills/sdd-planner.md     (default agent skills to plan in SDD format)
    │
    ├──▶ Health check:
    │    ├── Claude CLI installed?  → ✓ or link to install instructions
    │    ├── gh CLI available?     → ✓ or link to install instructions
    │    └── Git configured?       → ✓ or warning
    │
    └──▶ SDD sidebar appears in Activity Bar
         "Getting Started" walkthrough opens (VS Code Walkthrough API)
```

### Flow 2: Spec Authoring

```
Builder runs "SDD: New Spec from Template"
    │
    ├──▶ Quick Pick: Feature / Bug Fix / Refactor
    │
    ├──▶ Extension generates .specs/PROJ-043-untitled.sdd.md
    │    Pre-filled with template sections and next available spec_id
    │    File opens in editor
    │
    ├──▶ Builder fills in spec sections
    │    Markdown editing with VS Code native editor
    │    IntelliSense for relevant_files (workspace file paths)
    │    Validation runs on save → Problems panel shows errors
    │
    ├──▶ Builder runs "SDD: Mark Spec as Ready"
    │    ├── Validation passes → status updated to "ready" in frontmatter
    │    ├── Validation fails → errors shown, status stays "draft"
    │    └── Git commit auto-created: "sdd: mark PROJ-043 as ready"
    │
    └──▶ Spec appears under "Ready" in sidebar tree
```

### Flow 3: Planning (Requirements → Specs)

```
Builder runs "SDD: Plan Specs from Requirements"
    │
    ├──▶ INPUT REQUIREMENTS
    │    Extension opens a dedicated editor / input panel
    │    Builder describes what they want to build in natural language:
    │    e.g., "Add user authentication with email/password login,
    │    password reset, and session management"
    │    Builder can also paste PRD excerpts, user stories, or issue descriptions
    │
    ├──▶ CONTEXT ASSEMBLY (for planner)
    │    Extension assembles planner context:
    │    ├── Builder's requirements text
    │    ├── Project repo file tree (structure overview)
    │    ├── Existing specs in .specs/ (to avoid duplication)
    │    ├── Project conventions (.sdd/conventions.md)
    │    ├── Spec templates (so planner knows the expected format)
    │    └── SDD Planner skills (.sdd/skills/sdd-planner.md)
    │
    ├──▶ PLANNER EXECUTION
    │    Extension spawns Claude CLI with sdd-planner persona:
    │    $ claude --context .sdd/plan-context.md --skills .sdd/skills/sdd-planner.md
    │    AI agent analyzes requirements and decomposes into spec files
    │    Builder watches planning in terminal (streaming output)
    │
    ├──▶ SPEC GENERATION
    │    Planner outputs N spec files, extension writes them to .specs/:
    │    ├── PROJ-044-user-auth-model.sdd.md        (complexity: low)
    │    ├── PROJ-045-login-endpoint.sdd.md          (complexity: medium, depends_on: [PROJ-044])
    │    ├── PROJ-046-password-reset.sdd.md          (complexity: medium, depends_on: [PROJ-044])
    │    └── PROJ-047-session-management.sdd.md      (complexity: high, depends_on: [PROJ-045])
    │    All generated with status: "draft", proper tags, relevant_files, and depends_on
    │
    ├──▶ BUILDER REVIEWS PLAN
    │    All generated specs open in editor tabs
    │    Sidebar shows new specs under "Draft" with dependency indicators
    │    Builder can:
    │    ├── Edit any spec (adjust scope, add acceptance criteria, fix relevant_files)
    │    ├── Delete specs they don't want
    │    ├── Reorder dependencies
    │    └── Re-run planner with feedback: "SDD: Refine Plan"
    │         ("split PROJ-046 into two specs", "add API rate limiting spec")
    │
    └──▶ MARK READY
         Builder marks individual specs as Ready (or batch: "SDD: Mark All Planned as Ready")
         Specs appear in sidebar "Ready" column, ordered by dependency chain
         Scope estimation shown: "4 specs, ~350K tokens estimated, 2 high / 2 medium complexity"
```

### Flow 4: Execution

```
Builder right-clicks spec in sidebar → "Execute Spec"
    │
    ├──▶ PRE-FLIGHT CHECK
    │    ├── Spec status is "ready"?
    │    ├── Budget within limits?
    │    ├── Claude CLI available?
    │    └── No other execution running?
    │
    ├──▶ CONTEXT ASSEMBLY
    │    Extension assembles context file (.sdd/context-PROJ-043.md):
    │    ├── Spec content (full markdown)
    │    ├── Relevant file contents (read from workspace)
    │    ├── Project conventions (.sdd/conventions.md)
    │    ├── Agent skills (.sdd/skills/{agent_skills}.md)
    │    ├── Previous feedback (if re-execution)
    │    └── Scope constraints ("Only modify files listed in relevant_files.
    │         Do NOT modify files listed in must_not_touch.")
    │
    ├──▶ EXECUTE
    │    Extension spawns Claude CLI in a dedicated VS Code terminal:
    │    $ claude --context .sdd/context-PROJ-043.md --max-tokens 100000
    │    Spec status → "in_progress"
    │    Builder watches execution in real-time in the terminal
    │
    ├──▶ CAPTURE RESULTS
    │    On completion, extension:
    │    ├── Runs `git diff` to capture all file changes
    │    ├── Parses Claude CLI output for token usage
    │    ├── Saves execution record to .sdd/executions/PROJ-043/exec-001.json
    │    ├── Saves full log to .sdd/executions/PROJ-043/exec-001.log
    │    └── Checks if out-of-scope files were modified → warning if so
    │
    ├──▶ AUTO-VALIDATE (if enabled)
    │    Runs configured test command (e.g., npm test)
    │    Captures pass/fail, appends to execution record
    │
    └──▶ COMPLETE
         Spec status → "review"
         VS Code notification: "PROJ-043 execution complete — ready for review"
         Spec moves to "Review" in sidebar
```

### Flow 5: Review & Feedback

```
Builder clicks spec under "Review" in sidebar
    │
    ├──▶ "SDD: Review Spec" opens split view
    │    Left: Spec file (requirements, acceptance criteria)
    │    Right: Multi-file diff view (git diff of agent's changes)
    │    Bottom panel: Execution summary (tokens, duration, test results)
    │
    ├──▶ Builder reviews each changed file
    │    Uses VS Code native diff navigation (next/prev change)
    │
    ├──▶ DECISION (command palette or Webview buttons)
    │
    │    ├── [Approve] → Flow 6 (GitHub)
    │    │    Spec status → "done"
    │    │
    │    ├── [Request Changes]
    │    │    Builder writes feedback (opens .sdd/reviews/PROJ-043/review-001.md)
    │    │    On save: spec status → "ready"
    │    │    Builder can immediately re-execute (returns to Flow 4)
    │    │    Next execution includes previous output + feedback as context
    │    │
    │    └── [Reject]
    │         Spec status → "draft"
    │         Agent changes reverted (git checkout)
    │         Builder revises the spec itself
    │
    └──▶ Execution history visible in sidebar under the spec
```

### Flow 6: Ship to GitHub

```
Builder approves spec
    │
    ├──▶ Extension runs:
    │    $ git checkout -b sdd/PROJ-043-password-reset
    │    $ git add <changed files>
    │    $ git commit -m "feat: add password reset flow (PROJ-043)"
    │    $ git push -u origin sdd/PROJ-043-password-reset
    │
    ├──▶ Extension runs:
    │    $ gh pr create \
    │        --title "feat: add password reset flow (PROJ-043)" \
    │        --body "<spec summary + link to execution log>"
    │
    ├──▶ PR URL saved to execution record
    │    Spec detail in sidebar shows PR link
    │
    └──▶ Builder merges PR through normal GitHub workflow
         Extension detects merge → marks spec as fully shipped
```

### Flow 7: Kanban Board

```
Builder clicks "SDD: Open Kanban Board"
    │
    ├──▶ Webview panel opens with 5 columns: Draft | Ready | In Progress | Review | Done
    │    Each column lists spec cards containing:
    │    ├── spec_id + title (clickable → opens .sdd.md in editor)
    │    ├── Complexity badge (color-coded: low=green, medium=yellow, high=red)
    │    ├── Priority badge (high/medium/low)
    │    └── Tag chips + depends_on indicator if unresolved dependencies exist
    │
    ├──▶ Contextual action buttons on cards (per status):
    │    ├── draft    → [Mark Ready]
    │    ├── ready    → [Execute]
    │    └── review   → [Approve] [Request Changes]
    │    Button click → extension delegates to existing sdd.* commands
    │
    ├──▶ "New Spec +" button in header
    │    → postMessage({ type: 'openSpecForm' })
    │    → extension calls sdd.newSpecForm command
    │    → Spec Form panel opens in Create mode
    │
    ├──▶ Search/filter bar
    │    Builder types spec_id, title substring, or tag
    │    → Cards filter in real-time (non-matching cards hidden)
    │
    ├──▶ Drag card to adjacent valid column
    │    → Client-side lifecycle pre-validation (visual feedback)
    │    → On drop: postMessage({ type: 'kanbanMove', specId, newStatus })
    │    → Extension validates via lifecycle module
    │    → Valid: updates frontmatter status field
    │    → Invalid: sends moveError back → card shows inline error for 3s
    │
    └──▶ Click card title/ID → opens .sdd.md file in VS Code editor
```

### Flow 8: Spec Form (Create / Edit)

```
Triggered from Kanban "New Spec +" button (Create mode)
OR right-click spec in sidebar → "Edit in Form" (Edit mode)
    │
    ├──▶ CREATE MODE
    │    Panel opens with title "New Spec"
    │    spec_id auto-generated (next available PREFIX-NNN)
    │    All fields blank / defaults set
    │
    ├──▶ EDIT MODE
    │    Panel opens with title "Edit: {spec_id}"
    │    Extension reads .sdd.md → parses frontmatter + all body sections
    │    Form fields pre-populated
    │    "Open File" button visible → opens raw .sdd.md in editor
    │
    ├──▶ Builder fills in form sections:
    │    Identity:        spec_id (readonly), title, status, priority, complexity
    │    Classification:  tags (chips), agent_skills
    │    Scope:           relevant_files, must_not_touch, depends_on (multi-select)
    │    Budget:          budget_max_tokens (number + slider)
    │    Body sections:   Context, Requirements (Functional + Non-Functional),
    │                     Acceptance Criteria (Automated + Manual),
    │                     Constraints, Examples
    │
    ├──▶ Inline validation on Save:
    │    ├── Required: title non-empty
    │    ├── spec_id format: /^[A-Z]+-\d+$/
    │    └── relevant_files: warning if empty
    │
    ├──▶ Builder clicks "Save Spec"
    │    → Extension serializes: YAML frontmatter + markdown body sections
    │    → Create mode: writes .specs/{spec_id}-{slug}.sdd.md
    │    → Edit mode: overwrites existing file
    │    → Sidebar tree refreshed
    │    → Form shows "Saved" confirmation
    │
    └──▶ Spec appears in sidebar under its status column
```

---

## 7. Development Plan

### Phase 0 — Foundation (Weeks 1-2)

| Task | Description | Output |
|---|---|---|
| Extension scaffold | Yeoman generator, TypeScript, esbuild, debug config | Buildable empty extension |
| Spec format finalization | Formalize YAML frontmatter schema + markdown sections | JSON Schema for validation |
| Spec parser + validator | Parse `.sdd.md` files, validate required fields, emit VS Code diagnostics | `.specs/parser.ts`, `.specs/validator.ts`, `.specs/diagnostics.ts` |
| Spec templates | 3 templates: feature, bug fix, refactor | `.specs/templates.ts` |
| Spec lifecycle state machine | Status transitions with guards (e.g., can't execute a draft) | `.specs/lifecycle.ts` |
| Project init command | "SDD: Initialize Project" creates `.sdd/` folder structure | `config/projectConfig.ts` |

### Phase 1 — Sidebar & Navigation (Weeks 3-4)

| Task | Description | Output |
|---|---|---|
| Spec tree view | TreeDataProvider showing specs grouped by status with icons | `views/sidebar/specTreeProvider.ts` |
| Context menu actions | Right-click: Mark Ready, Execute, Review, etc. | Commands wired to tree items |
| Spec ID generation | Auto-increment IDs from project prefix | `.specs/specIdGenerator.ts` |
| File path IntelliSense | Autocomplete for `relevant_files` and `must_not_touch` fields | Custom CompletionItemProvider |
| Status bar item | Show active spec count and current execution status | Status bar integration |

### Phase 2 — Planning & Execution Engine (Weeks 5-8)

| Task | Description | Output |
|---|---|---|
| SDD Planner skills file | Write `.sdd/skills/sdd-planner.md` — agent persona that understands SDD format, decomposition, dependency ordering | Default skills file shipped with extension |
| Planner context assembler | Build planner-specific context: requirements + repo tree + existing specs + conventions + templates | `planning/planContextAssembler.ts` |
| Planner orchestrator | Run Claude CLI with sdd-planner persona, parse output into spec file batch | `planning/planner.ts` |
| Spec batch writer | Write generated specs to `.specs/` with sequential IDs, proper frontmatter, dependency links | `planning/specBatchWriter.ts` |
| Dependency resolver | Validate `depends_on:` links, detect cycles, compute execution order | `planning/dependencyResolver.ts` |
| Plan refinement loop | Re-run planner with builder feedback to split, merge, or adjust generated specs | Feedback input → re-plan flow |
| Context assembler | Build full context from spec + files + conventions + skills + feedback | `execution/contextAssembler.ts` |
| Claude CLI runner | Spawn Claude CLI in VS Code terminal, manage lifecycle | `execution/cliRunner.ts` |
| Result capture | Parse git diff after execution, extract token counts from CLI output | `execution/resultCapture.ts` |
| Budget enforcer | Token limit checks, abort/warn on exceed | `execution/budgetEnforcer.ts` |
| Skills loader | Load agent persona files, inject into context | `execution/skillsLoader.ts` |
| Post-validation | Run test command after execution, capture results | `execution/postValidation.ts` |
| Execution records | Save execution JSON + log to `.sdd/executions/` | File I/O utilities |

### Phase 3 — Review & GitHub (Weeks 9-10)

| Task | Description | Output |
|---|---|---|
| Review manager | Open split view: spec + diff, decision commands | `review/reviewManager.ts` |
| Multi-file diff | Show all changed files in VS Code diff viewer | `review/diffProvider.ts` |
| Feedback loop | Save feedback, re-assemble context with feedback, re-execute | `review/feedbackWriter.ts` |
| Git operations | Branch creation, staging, committing | `github/gitOps.ts` |
| PR creation | Shell out to `gh pr create` with spec-derived content | `github/prCreator.ts` |
| Scope check | Warn if agent modified files outside `relevant_files` | Post-execution validation |

### Phase 4 — Webviews & Polish (Weeks 11-14)

| Task | Description | Output |
|---|---|---|
| Dashboard webview | Project overview: spec counts, cost summary, recent activity | `views/webviews/dashboard/` |
| Kanban webview (SDD-040, enhanced scope) | All 5 columns; contextual action buttons per card status (Mark Ready, Execute, Approve, Request Changes); "New Spec +" header button → opens Spec Form; search/filter bar; drag-and-drop with server-side lifecycle validation | `views/webviews/kanban/` |
| Spec form webview (SDD-041, enhanced scope) | Full body sections as labeled form fields; Create mode (auto-generates spec_id, triggered from Kanban) + Edit mode (parses existing file); Save serializes complete `.sdd.md` (frontmatter + all sections) | `views/webviews/specForm/` |
| Onboarding walkthrough | Step-by-step guide using VS Code Walkthrough API | Walkthrough contribution |
| Cost analytics | Per-spec and per-project cost charts in dashboard | `analytics/costTracker.ts` |
| Scope estimation | Aggregate spec count x complexity breakdown | `analytics/scopeEstimator.ts` |
| Extension settings | VS Code settings UI for all sdd.* configuration | Settings contribution |
| Testing | Unit tests for parser, validator, context assembler, lifecycle | `test/` directory |
| Marketplace prep | Icon, README, screenshots, changelog, .vscodeignore | Publishing assets |

### Summary Timeline

```
Weeks 1-2:   Foundation (parser, validator, templates, lifecycle, project init)
Weeks 3-4:   Sidebar & Navigation (tree views, commands, IntelliSense)
Weeks 5-8:   Planning & Execution Engine (planner agent, context assembly, Claude CLI, result capture)
Weeks 9-10:  Review & GitHub (diff view, feedback loop, PR creation)
Weeks 11-14: Webviews & Polish (dashboard, kanban, onboarding, tests)
Week 15:     VS Code Marketplace launch
```

---

## 8. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Extension runtime | TypeScript + VS Code Extension API | Core extension logic |
| Extension bundler | esbuild | Fast builds, small bundle |
| Webview UI | Svelte + Vite | Lightweight webview panels (dashboard, kanban, spec form) |
| Spec format | YAML frontmatter + Markdown | Spec authoring and storage |
| Schema validation | Ajv (JSON Schema) | Validate spec frontmatter |
| YAML parsing | yaml (npm) | Parse/serialize frontmatter |
| Markdown parsing | markdown-it or remark | Parse spec sections |
| AI execution | Claude CLI (external) | Agent runs in integrated terminal |
| Version control | Git CLI (external) | Branching, committing, diffing |
| GitHub | gh CLI (external) | PR creation |
| Testing | Vitest | Unit and integration tests |
| E2E testing | @vscode/test-electron | Extension integration tests |

---

## 9. Monetization Strategy

### Freemium Model via VS Code Marketplace

**Goal for the first 6 months:** Maximize adoption among vibe coders. Revenue is secondary — the priority is building a user base, collecting feedback, and proving the SDD workflow.

### Free Tier (Forever Free)

Everything a solo vibe coder needs:

- Unlimited specs and templates
- Spec validation and lifecycle management
- Sidebar tree view (specs by status)
- Claude CLI execution (unlimited — user pays Anthropic directly via BYOK)
- Review flow with native diff viewer
- GitHub integration (branch + commit + PR)
- Per-spec cost tracking
- Project initialization and onboarding

### Pro Tier ($12/month or $99/year)

Power features for serious builders:

- **Dashboard webview** with project analytics and cost charts
- **Kanban board** webview with drag-and-drop
- **Structured spec form** webview (alternative to raw markdown)
- **Scope estimation** across phases and areas
- **Multi-project support** (multiple `.sdd/` configs in workspace)
- **Custom agent skills** — create unlimited persona files
- **Priority support** — GitHub issues with priority label
- **Badge** — "SDD Pro" in extension status bar

### Why This Pricing Works

1. **BYOK means zero AI cost for the platform.** Users pay Anthropic directly. The extension charges for orchestration and UX, not compute.
2. **Free tier is fully functional.** A vibe coder can write specs, execute them, review output, and ship PRs without paying. This drives adoption.
3. **Pro tier sells convenience, not capability.** Dashboard, Kanban, and the structured form make the workflow faster and more visual — worth $12/month for anyone using SDD daily.
4. **$12/month is impulse-buy territory** for developers. Lower than GitHub Copilot ($19/month), much lower than Cursor Pro ($20/month).

### Monetization Mechanics

- License key validation via a lightweight API (e.g., Gumroad, LemonSqueezy, or Polar.sh)
- Extension checks license on activation → unlocks Pro webviews
- No telemetry, no data collection — privacy-first aligns with BYOK philosophy
- Revenue from marketplace (Microsoft takes 0% cut for free extensions, but paid extensions are not supported on the marketplace — so use external licensing)

### Growth Path

```
Phase 1 (Months 1-6):  Free extension → build user base → collect feedback
Phase 2 (Months 6-12): Introduce Pro tier → monetize power users
Phase 3 (Year 2+):     Optional cloud SaaS for teams (multi-user review,
                        shared dashboards, team analytics) → Team tier at $20/user/month
```

### Revenue Projection (Illustrative)

Assuming 2,000 installs after 6 months, 8% Pro conversion:
- 1,840 Free users x $0 = $0
- 160 Pro users x $12/mo = $1,920/mo
- **Month 12 MRR: ~$1,920**

Low but sustainable for a solo product. The real upside is proving the SDD workflow and building toward a Team/Cloud tier.

---

## 10. Capability Coverage (Original Capabilities Preserved)

| # | Original Capability | VS Code Extension Mapping |
|---|---|---|
| 1 | Platform for planning, executing, monitoring AI agents with SDD format | Extension: AI planning (requirements → specs) + spec authoring + CLI execution + terminal monitor + sidebar |
| 2 | User called "builder" | Terminology preserved throughout |
| 3 | SDD templates provided by platform; AI assists in planning | Template picker command; "Plan Specs from Requirements" uses sdd-planner agent to decompose requirements into spec files |
| 4 | Templates = project contracts, small artefacts, has tags | `.sdd.md` files with YAML frontmatter tags |
| 5 | SDD tags link phases | Frontmatter `tags:` array, filtered in sidebar tree |
| 6 | Templates in markdown; AI assists creation | Native markdown editing in VS Code |
| 7 | Completion of contracts tracks development | Sidebar tree + dashboard webview with completion % |
| 8 | AI prohibited from touching files not in contracts | `must_not_touch` + `relevant_files` in spec; post-execution scope check |
| 9 | Naming convention (ProjectID_Title) | Auto-generated `spec_id` in frontmatter (PREFIX-NNN) |
| 10 | Scope estimation from contract count + complexity | `analytics/scopeEstimator.ts` aggregation |
| 11 | Token count as budget; budget estimation | `budget_max_tokens` in spec; `analytics/costTracker.ts` |
| 12 | Parse markdown contracts and display nicely | VS Code markdown preview + sidebar tree |
| 13 | Builder triggers execution; Claude as main AI | "Execute Spec" command → Claude CLI |
| 14 | Builder pre-selects skills.md per contract | `agent_skills` frontmatter field → loads from `.sdd/skills/` |
| 15 | Configure agents with skills.md and definition of done | Skills files + acceptance criteria in spec |
| 16 | GitHub commit and PR | `github/gitOps.ts` + `github/prCreator.ts` via CLI |
| 17 | Visualize all development stages | Sidebar tree + Kanban webview |
| 18 | Budget constraints per contract | `budget_max_tokens` enforced during execution |
| 19 | Risk projection (Post-MVP) | Post-MVP: risk scoring based on complexity + file count |
| 20 | Multi-agent pipeline (Post-MVP) | Post-MVP: sequential execution with different skills per stage |
| 21 | Different agents per stage (Post-MVP) | Post-MVP: pipeline config in `.sdd/config.json` |
| 22 | Timeline projection (Post-MVP) | Post-MVP: estimate from historical execution durations |

---

## Closing: Why VS Code Extension First

**The SDD spec format is the product. VS Code is just the best delivery vehicle for MVP.**

- Zero infrastructure cost — no servers, databases, or sandboxes to maintain
- Developers are already in VS Code — zero context-switching
- Claude CLI already works in VS Code's terminal — no execution engine to build
- Git and GitHub CLI are native to the developer workflow — no integration overhead
- VS Code Marketplace provides distribution to millions of developers
- File-based storage means the entire SDD state is version-controlled and portable
- Freemium model keeps the barrier to entry at zero

Build the extension. Validate the workflow. Then decide if the world needs a cloud SaaS version.

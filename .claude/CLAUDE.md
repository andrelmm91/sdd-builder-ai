# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SDD Agentic** is a VS Code extension for Spec-Driven Development (SDD) — a structured, AI-assisted development workflow where requirements are decomposed into small, independently executable spec files (`.sdd.md`), then executed by AI agents via Claude CLI.

**Current status:** Architecture and planning phase. No source code yet — only product specs and agent persona definitions exist.

## Key Files

- `.sdd/product_feature/Idea_1_SDD_VSCode_Extension.md` — Full MVP architecture, feature mapping, development plan, and monetization strategy (the project bible)
- `.claude/skills/sdd-planner.md` — SDD Planner agent persona definition (decomposition rules, spec format, planning process)
- `.specs/` — Will contain `.sdd.md` spec files (currently empty)

## Planned Tech Stack

- **Extension:** TypeScript + VS Code Extension API
- **Bundler:** esbuild
- **Webviews:** Svelte + Vite
- **Spec format:** YAML frontmatter + Markdown
- **Validation:** Ajv (JSON Schema)
- **Testing:** Vitest + @vscode/test-electron
- **External tools:** Claude CLI, Git, gh CLI

## Planned Build Commands

```bash
npm run build        # Build extension with esbuild
npm run dev          # Development mode with watch
npm test             # Run tests (Vitest)
npm run lint         # Lint TypeScript
npm run type-check   # Type checking
```

## Architecture (Planned)

The extension follows a modular architecture under `src/`:

- **specs/** — Parser, validator, diagnostics, templates, lifecycle state machine for `.sdd.md` files
- **planning/** — Orchestrator that invokes the SDD Planner agent to decompose requirements into specs
- **execution/** — Context assembler, Claude CLI runner, token budget enforcement, post-validation
- **review/** — Split-view diff provider, feedback capture, approve/request-changes flow
- **github/** — Git operations (branch, commit, push) and PR creation via `gh` CLI
- **views/sidebar/** — VS Code TreeView providers for spec navigation
- **views/webviews/** — Svelte webviews for dashboard, kanban board, and spec form editor

## SDD Spec Format

Every spec is a `.sdd.md` file with YAML frontmatter (`spec_id`, `status`, `priority`, `complexity`, `relevant_files`, `must_not_touch`, `depends_on`, `budget_max_tokens`, `agent_skills`) followed by markdown sections: Context, Requirements, Acceptance Criteria, Constraints, and Examples.

**Hard constraints per spec:**
- Maximum 3 files to create/edit (excluding test files)
- Single responsibility — one spec does one thing
- Completable in ≤ 1 day
- `relevant_files` provides all necessary context; `must_not_touch` protects files from modification

**Status lifecycle:** `draft → ready → in_progress → review → done`

**Dependency ordering:** Foundation (types, models) → Features (API, UI) → Integration (wiring). No circular dependencies — must form an acyclic DAG.

## Data Model

All state is file-based and version-controlled (no database):
- `.specs/*.sdd.md` — Spec definitions
- `.sdd/executions/{SPEC_ID}/` — Execution records (JSON + logs)
- `.sdd/reviews/{SPEC_ID}/` — Reviewer feedback
- `.sdd/skills/` — Agent persona definitions
- `.sdd/config.json` — Project settings (prefix, test command, conventions path)
- `.sdd/conventions.md` — Project-specific code conventions

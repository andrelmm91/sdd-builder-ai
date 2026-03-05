---
spec_id: SDD-044
title: Implement onboarding walkthrough
status: draft
priority: medium
complexity: medium
tags: [phase-4, frontend]
relevant_files:
  - src/extension.ts
  - package.json
must_not_touch:
  - src/views/webviews/dashboard/DashboardPanel.ts
depends_on: [SDD-012, SDD-014]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

First-time users need guided onboarding to understand the SDD workflow. VS Code's Walkthrough API provides a native step-by-step guide with highlighted UI elements. This spec implements a walkthrough that guides builders through project initialization, spec creation, and their first execution.

## Requirements

### Functional
- Add a `walkthroughs` contribution in `package.json`:
  - ID: `sdd.gettingStarted`
  - Title: "Getting Started with SDD"
  - Steps:
    1. **Initialize your project** — "Run 'SDD: Initialize Project' to set up the .sdd folder structure" (links to `sdd.initProject` command)
    2. **Create your first spec** — "Run 'SDD: New Spec from Template' to create a feature spec" (links to `sdd.newSpec` command)
    3. **Understand the spec format** — Explains the YAML frontmatter and markdown sections (informational)
    4. **Mark spec as ready** — "Edit your spec, then run 'SDD: Mark Spec as Ready'" (links to `sdd.markReady`)
    5. **Execute with AI** — "Run 'SDD: Execute Spec' to have Claude implement your spec" (links to `sdd.executeSpec`)
    6. **Review and ship** — "Review the AI's changes and approve to create a PR" (links to `sdd.reviewSpec`)
  - Each step must have a description, media (icon or image), and a completion command
- Show walkthrough automatically on first activation (if no `.sdd/config.json` exists)

### Non-Functional
- Walkthrough must work in VS Code 1.85+ (Walkthrough API)

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes

### Manual
- [ ] Walkthrough appears in "Get Started" sidebar section
- [ ] Each step links to the correct command
- [ ] Steps can be completed sequentially

## Constraints
- Must use VS Code Walkthrough API — no custom webview for onboarding
- Must only show automatically on first activation (respect user's choice to dismiss)

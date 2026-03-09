# Changelog

All notable changes to the SDD Platform extension will be documented in this file.

## [Unreleased]

### Added

- `sdd.createSddCards` command: invokes AI CLI to generate `.sdd.md` spec files in `.specs/` from an idealization document using the SDD Planner skill (SDD-069)
- Post-validates that at least one new spec was created, then updates `idealization.md` and `{feature_name}.md` statuses to `SDD Created`
- Progress notification with cancellation support during SDD card generation
## [0.1.0] - 2026-03-07

### Added

- SDD spec format with YAML frontmatter and markdown sections
- Spec parser and JSON Schema validator with inline diagnostics
- Spec lifecycle state machine (draft -> ready -> in_progress -> review -> done)
- Sidebar tree view for browsing and managing specs
- Spec execution via Claude CLI with token budget enforcement
- Post-execution validation (TypeScript compilation, tests, lint)
- Split-view diff reviewer with approve/request-changes/reject flow
- Git branch, commit, and PR creation via gh CLI
- Planning agent integration for decomposing requirements into specs
- Dashboard webview with spec status overview and cost analytics
- Kanban board webview with drag-and-drop status transitions
- Spec form webview for creating and editing specs
- Cost tracking and scope estimation analytics
- Getting Started walkthrough for onboarding
- Project initialization command (SDD: Initialize Project)

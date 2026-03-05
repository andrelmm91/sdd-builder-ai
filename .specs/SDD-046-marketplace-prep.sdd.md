---
spec_id: SDD-046
title: Prepare extension for VS Code Marketplace publishing
status: draft
priority: medium
complexity: low
tags: [phase-4, infra]
relevant_files:
  - package.json
  - .vscodeignore
  - CHANGELOG.md
must_not_touch:
  - src/extension.ts
depends_on: [SDD-001, SDD-038]
budget_max_tokens: 50000
agent_skills: infra
created: 2026-03-05
---

## Context

Before publishing to the VS Code Marketplace, the extension needs proper metadata, a changelog, marketplace-ready README, extension icon, and a `.vscodeignore` that excludes unnecessary files from the package.

## Requirements

### Functional
- Update `package.json`:
  - `publisher` field (placeholder — builder fills in)
  - `repository` field pointing to GitHub repo
  - `icon` pointing to `media/logo.png`
  - `galleryBanner` with theme-appropriate colors
  - `keywords`: ["sdd", "spec-driven", "ai", "claude", "code-generation", "specs"]
  - `license`: "MIT" (or appropriate)
  - `engines.vscode` set to minimum supported version
- `.vscodeignore` must exclude:
  - `src/`, `test/`, `webview-ui/src/`, `node_modules/`, `.github/`, `.sdd/`, `.specs/`
  - Config files: `tsconfig.json`, `vitest.config.ts`, `esbuild.config.mjs`, `vite.config.ts`
  - Only include: built output, `package.json`, `README.md`, `CHANGELOG.md`, `media/`, `dist/`
- `CHANGELOG.md` — initial changelog with v0.1.0 entry listing MVP features
- Verify `vsce package` produces a clean `.vsix` file

### Non-Functional
- Package size must be under 5MB
- Extension must activate without errors when installed from .vsix

## Acceptance Criteria

### Automated
- [ ] `vsce package` completes without errors (or `npx @vscode/vsce package`)
- [ ] TypeScript compilation passes

### Manual
- [ ] Installing the .vsix in VS Code shows the extension correctly
- [ ] Extension icon appears in the Extensions sidebar

## Constraints
- Do not publish to marketplace — only prepare for publishing
- Use placeholder values for publisher (builder will set their own)

---
spec_id: SDD-001
title: Scaffold VS Code extension project
status: draft
priority: high
complexity: medium
tags: [phase-0, infra]
relevant_files:
  - package.json
  - tsconfig.json
  - esbuild.config.mjs
  - .vscode/launch.json
  - .vscodeignore
  - .gitignore
must_not_touch: []
depends_on: []
budget_max_tokens: 100000
agent_skills: infra
created: 2026-03-05
---

## Context

This is the very first spec for the SDD VS Code extension. Before any feature code can be written, we need a buildable extension scaffold. This sets up the TypeScript project, VS Code extension manifest, build tooling (esbuild), and debug configuration. No runtime features are implemented here — just the skeleton that all other specs build on.

## Requirements

### Functional
- `package.json` must include the VS Code extension manifest fields: `name` ("sdd-platform"), `displayName` ("SDD Platform"), `engines.vscode`, `main` pointing to bundled output, `activationEvents` (workspaceContains patterns for `.sdd.md` and `.sdd/config.json`), and the `contributes` section with initial commands (`sdd.initProject`, `sdd.newSpec`), `viewsContainers`, `views`, `configuration` properties, and `languages` definition for `.sdd.md` files
- `tsconfig.json` must target ES2020+ with strict mode, module resolution suitable for VS Code extensions, and `outDir` set appropriately
- `esbuild.config.mjs` must bundle the extension to a single file with `vscode` as external dependency
- `.vscode/launch.json` must include an "Extension" debug configuration that launches the Extension Development Host
- `.vscodeignore` must exclude source files, test files, and config files from the packaged extension
- A minimal `src/extension.ts` must exist with `activate()` and `deactivate()` exports (empty implementations)

### Non-Functional
- Build must complete in under 5 seconds
- Extension must activate without errors in the Extension Development Host

## Acceptance Criteria

### Automated
- [ ] `npm install` completes without errors
- [ ] `npm run build` produces a bundled output file
- [ ] TypeScript compilation (`npx tsc --noEmit`) passes with no errors

### Manual
- [ ] Extension loads in VS Code Extension Development Host (F5)
- [ ] Extension appears in the Extensions sidebar when running in dev mode

## Constraints
- Must use esbuild (not webpack) for bundling
- Must use TypeScript strict mode
- Must not add any runtime dependencies beyond the VS Code API
- Do not implement any commands or views — just register empty stubs

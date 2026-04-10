---
spec_id: SDD-038
title: Set up webview build infrastructure with Svelte and Vite
status: done
priority: high
complexity: medium
tags: [phase-4, infra, frontend]
relevant_files:
  - webview-ui/vite.config.ts
  - webview-ui/src/lib/vscode.ts
  - webview-ui/src/lib/types.ts
must_not_touch:
  - src/extension.ts
  - esbuild.config.mjs
depends_on: [SDD-001]
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

The dashboard, kanban board, and spec form are rendered as VS Code webviews using Svelte compiled by Vite. Before building any webview panel, we need the build infrastructure: Vite config, Svelte setup, a VS Code API wrapper for webview↔extension messaging, and shared types.

## Requirements

### Functional
- `webview-ui/vite.config.ts` — Vite config for building Svelte webviews:
  - Multiple entry points (one per webview: dashboard, kanban, specForm)
  - Output to `dist/webviews/` with hashed filenames
  - Svelte plugin configured
- `webview-ui/src/lib/vscode.ts` — wrapper around `acquireVsCodeApi()` for type-safe messaging:
  - `postMessage(type: string, data: unknown): void`
  - `onMessage(handler: (message: { type: string; data: unknown }) => void): void`
- `webview-ui/src/lib/types.ts` — shared types for webview↔extension messages:
  - `WebviewMessage` type with discriminated union by `type` field
  - Message types: `specList`, `specUpdate`, `dashboardData`, `kanbanMove`, `navigate`
- Add dev dependencies: `svelte`, `@sveltejs/vite-plugin-svelte`, `vite`
- Add `npm run build:webview` script to package.json

### Non-Functional
- Webview builds must complete in under 10 seconds
- Built output must be small (<500KB per webview)

## Acceptance Criteria

### Automated
- [ ] `npm run build:webview` completes without errors
- [ ] TypeScript compilation passes for webview code

### Manual
- [ ] Built webview assets are generated in dist/webviews/

## Constraints
- Must use Svelte (not React or Vue) as specified in the tech stack
- Must use Vite (not webpack) for webview builds
- Extension code (esbuild) and webview code (Vite) use separate build systems

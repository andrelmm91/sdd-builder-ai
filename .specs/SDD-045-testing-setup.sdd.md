---
spec_id: SDD-045
title: Set up testing infrastructure with Vitest
status: done
priority: high
complexity: medium
tags: [phase-4, testing, infra]
relevant_files:
  - vitest.config.ts
  - test/fixtures/sample-spec.sdd.md
  - test/setup.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-001]
agent_skills: backend-dev
created: 2026-03-05
---

## Context

All previous specs mention unit tests in their acceptance criteria, but the test infrastructure hasn't been set up yet. This spec establishes the Vitest configuration, test fixtures (sample `.sdd.md` files), and mocking utilities for VS Code API. This enables all modules to have their tests run.

## Requirements

### Functional
- `vitest.config.ts` — Vitest configuration:
  - Test file pattern: `test/**/*.test.ts` and `src/**/*.test.ts`
  - TypeScript support
  - VS Code API mock (since `vscode` module is not available in test environment)
  - Coverage reporting (istanbul or v8)
- `test/setup.ts` — global test setup:
  - Mock `vscode` module with stubs for common APIs: `workspace`, `window`, `commands`, `Uri`, `DiagnosticCollection`
  - Helper functions: `createMockSpec()`, `createMockExecutionRecord()`
- `test/fixtures/sample-spec.sdd.md` — a valid sample spec for parser/validator tests
- `test/fixtures/invalid-spec.sdd.md` — a spec with various validation errors
- Add `vitest` as dev dependency
- Add `npm test` script: `vitest run`
- Add `npm run test:watch` script: `vitest`

### Non-Functional
- Tests must run in under 30 seconds for the full suite
- Must work in CI (no VS Code Extension Development Host required)

## Acceptance Criteria

### Automated
- [ ] `npm test` runs without configuration errors
- [ ] Sample fixture spec passes validation
- [ ] Invalid fixture spec produces expected validation errors
- [ ] TypeScript compilation passes

### Manual
- [ ] Tests can be run from VS Code Test Explorer

## Constraints
- Must use Vitest (not Jest or Mocha)
- VS Code API mocking must be in a shared setup file (not duplicated per test)
- Fixtures must be valid .sdd.md files that match the spec format

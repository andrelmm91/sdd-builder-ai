---
spec_id: SDD-077
title: Add tests for idealizeRequirements and createSddCards commands
status: done
priority: medium
complexity: medium
tags: [phase-2, testing, backend]
relevant_files:
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
  - src/commands/planFromRequirements.test.ts
  - src/execution/cliRunner.test.ts
must_not_touch:
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
depends_on: [SDD-072, SDD-073]
agent_skills: backend-dev
created: 2026-03-09
---

## Context

Every command in `src/commands/` has a corresponding `.test.ts` file except `idealizeRequirements.ts` and `createSddCards.ts`. These two commands contain non-trivial logic including prompt building, post-validation with file renaming, status updates, and error handling that must be covered by tests.

This spec depends on SDD-072 and SDD-073 because the tests should cover the fixed implementation (not the broken `--print` version) and reference the extracted shared utilities.

Use `planFromRequirements.test.ts` and `cliRunner.test.ts` as reference patterns for how to mock `vscode`, `child_process`, and file system operations in this project.

## Requirements

### Functional

**Create `src/commands/idealizeRequirements.test.ts`:**
- Test `buildIdealizePrompt()` (or its equivalent after refactoring): verify it includes the feature file path with `@` reference
- Test post-validation logic:
  - When `idealization.md` exists: verify frontmatter is checked and updated if needed
  - When `idealization.md` doesn't exist but another `.md` file does: verify rename to `idealization.md`
  - When no output file exists: verify error is thrown
  - Verify original feature file status is updated to `'Idealization In Review'`
- Test error handling:
  - CLI not available: shows error message
  - CLI process fails (non-zero exit): shows error message
  - Cancellation: resolves without error
- Test workspace root not open: shows error and returns early

**Create `src/commands/createSddCards.test.ts`:**
- Test `buildCreateSddCardsPrompt()` (or equivalent): verify it references `idealization.md` path and SDD Planner skill
- Test spec file detection:
  - Before/after snapshot correctly identifies new files
  - When new specs are created: verify count in success message
  - When no new specs are created: verify error message
- Test status updates after success:
  - `idealization.md` status updated to `'SDD Created'`
  - Feature file status updated to `'SDD Created'`
- Test error handling:
  - CLI not available
  - CLI process fails
  - Cancellation

### Non-Functional
- Use the same test patterns as `planFromRequirements.test.ts` for mocking VS Code APIs
- Use `vi.mock()` for child_process and vscode modules
- Each test file should have at least 8 test cases

## Acceptance Criteria

### Automated
- [x] All new tests pass (`npm test`)
- [x] TypeScript compilation passes on test files
- [x] Coverage includes: prompt building, post-validation (happy + error paths), cancellation, timeout

### Manual
- [x] Running `npm test -- --reporter=verbose` shows all test cases passing with descriptive names

## Constraints
- Do not modify the source files (`must_not_touch`) — tests only
- Follow the existing test file naming convention: `{module}.test.ts` alongside the source file
- Use Vitest (not Jest) — the project uses `vitest`

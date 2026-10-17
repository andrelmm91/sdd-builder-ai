---
spec_id: SDD-104-NEW
title: Add SDD Doctor command to check the environment before executing
status: draft
priority: medium
complexity: medium
tags: [feature, phase-6, backend, rel-v2.0]
relevant_files:
  - src/commands/doctor.ts
  - src/extension.ts
  - package.json
must_not_touch:
  - src/commands/executeSpec.ts
  - src/execution/cliRunner.ts
depends_on: [SDD-078-BUGFIX, SDD-088-NEW, SDD-097-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
New users, especially vibe coders, hit setup problems at execution time: the AI CLI is not installed or not logged in, the workspace is not a git repo (so change tracking and discard don't work), there are uncommitted changes, no test command is set, or `conventions.md` is still the empty template. A single command that checks everything and explains each fix in plain language reduces failed first runs.

## Requirements
### Functional
- Create `src/commands/doctor.ts` exporting `runDoctor(): Promise<DoctorReport>` and the command handler `doctorCommand()`.
- `DoctorReport = { checks: { id: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string }[] }`.
- Checks:
  1. `.sdd/config.json` exists and parses (fail).
  2. The configured provider's binary is available, using `getProviderBinary` from SDD-078 or the provider definitions from SDD-097 (fail).
  3. `git` is available and the workspace is a git repository (warn; detail explains that change tracking and discard are disabled).
  4. Working tree is clean (warn; detail lists the count of modified files).
  5. At least one quality gate or test command is configured (warn).
  6. `.sdd/conventions.md` has content beyond the template's comment lines (warn).
  7. The permission mode is noted: a batch mode is required for bulk execution (info rendered as `ok` with detail).
- `doctorCommand()` writes the report to an output channel named `SDD Doctor` with ✓/⚠/✗ prefixes and fix hints, opens it, and shows a summary notification (`SDD Doctor: N problem(s) found` or `SDD Doctor: all checks passed`).
- Register the command `sdd.doctor` (title `SDD: Run Doctor`) in `package.json` and `src/extension.ts`.

### Non-Functional
- All checks complete in under 5 seconds on a typical machine; each external command uses a 5 s timeout.
- Checks never modify anything.

## Acceptance Criteria
### Automated
- [ ] `src/commands/doctor.test.ts` covers each check's ok, warn and fail paths with mocked shell and file system.
- [ ] A test asserts `sdd.doctor` is declared in `package.json`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Running `SDD: Run Doctor` in a fresh, non-git folder shows the git warning with a fix hint.

## Constraints
- In `src/extension.ts`, only add the import and command registration.
- Do not auto-run the doctor on activation in this spec.

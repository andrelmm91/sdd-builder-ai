---
spec_id: SDD-080-BUGFIX
title: Harden isCommandAvailable against shell injection
status: done
priority: medium
complexity: low
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/utils/shell.ts
  - src/execution/postValidation.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
`isCommandAvailable(command)` in `src/utils/shell.ts` interpolates its argument directly into a shell string (`where <command>` on Windows, `$SHELL -l -c 'which <command>'` on POSIX). The value comes from user-editable settings (`sdd.claudeCliBinary`) and from the first token of the test command in `.sdd/config.json` (`runPostValidation` in `src/execution/postValidation.ts`). A value containing quotes, `;`, `&` or `|` breaks the check or runs unintended commands. This matters because spec repositories, including `.sdd/config.json`, can come from other people.

**Current behavior:** A binary name containing `'; echo pwned; '` executes the injected command.

**Expected behavior:** Command names that are not plain executable names or paths are rejected (return `false`) without spawning a process. Valid names are safely quoted before use.

## Requirements
### Functional
- `isCommandAvailable` must return `false` without spawning a process when `command` is empty or does not match `^[A-Za-z0-9._\-\/\\: ~]+$`.
- For valid input, the command name must be quoted for the target shell before interpolation. Windows paths with spaces (for example under `C:\Program Files\`) must work.
- `runPostValidation` must keep handling `npm`/`npx`-style test commands as today. If the base command is rejected, it returns `passed: false` with output `Invalid test command: "<base>"`.

### Non-Functional
- No behavior change for valid binary names in use today (`claude`, `gh`, `git`, `npm`, `npx`, absolute paths).

## Acceptance Criteria
### Automated
- [x] `src/utils/shell.test.ts` adds cases for a valid name, an absolute path with spaces, and injection attempts using `;`, `&&`, `|`, single quotes, backticks and `$()`, asserting `false` and that no process is spawned.
- [x] `src/execution/postValidation.test.ts` covers the invalid base command path.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] Setting `sdd.claudeCliBinary` to a malicious value shows the "CLI not found" error and runs nothing.

## Constraints
- Do not change `execCommand` semantics.
- Do not add dependencies.

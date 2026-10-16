---
spec_id: SDD-079-BUGFIX
title: Fix prompt quoting for PowerShell on Windows
status: done
priority: high
complexity: medium
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/utils/shellQuote.ts
  - src/execution/cliRunner.ts
  - src/execution/cliCommandBuilder.ts
must_not_touch:
  - src/extension.ts
  - src/commands/executeSpec.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---





## Context
`CliRunner._buildCommand()` (`src/execution/cliRunner.ts`) and `buildCliCommand()` (`src/execution/cliCommandBuilder.ts`) quote the prompt with a bash-style helper `sq()`, which escapes an embedded single quote as `'\''`. On Windows, the command is sent via `terminal.sendText` to a PowerShell terminal, where that sequence is not a valid escape. Any apostrophe in the pre-prompt, the spec title (substituted into commit/PR commands) or skill paths produces a broken command line.

**Current behavior:** A prompt such as `Implement the user's profile page` produces a malformed PowerShell command, and the AI CLI either never starts or receives a truncated prompt.

**Expected behavior:** Strings are quoted for the shell that will actually run the command: bash on macOS/Linux, PowerShell on Windows (single quote doubled).

**Root cause:** One bash quoting helper is used on both platforms. `cliRunner.ts` already contains a correct `psq()` helper, but uses it only for file paths.

**Reproduce:** On Windows, set the pre-prompt to `Implement {spec_file}. Don't modify tests.` and execute a ready spec.

## Requirements
### Functional
- Create `src/utils/shellQuote.ts` exporting:
  - `quoteBash(str: string): string`: single-quote wrapping with bash escaping.
  - `quotePowerShell(str: string): string`: single-quote wrapping with doubled single quotes.
  - `quoteForShell(str: string, platform: NodeJS.Platform = process.platform): string`: `quotePowerShell` on `win32`, `quoteBash` otherwise.
- Replace the local `sq()`/`psq()` helpers in `cliRunner.ts` with the new module. Use `quoteForShell` for every value placed into a command sent via `sendText` on Windows, and `quoteBash` for content written into the POSIX bash script.
- Replace the local `sq()` in `cliCommandBuilder.ts` with `quoteForShell`.
- Embedded double quotes must survive when passed from Windows PowerShell 5.1 to a native executable: escape `"` as `\"` inside PowerShell-quoted native arguments, and document why in a code comment.

### Non-Functional
- Pure functions with no I/O, unit-testable via an explicit `platform` argument.

## Acceptance Criteria
### Automated
- [x] `src/utils/shellQuote.test.ts` covers plain text, single quotes, double quotes, `$`, backticks and newlines for both `linux` and `win32`.
- [x] Existing `cliRunner.test.ts` tests still pass, and a new test asserts that on `win32` a title containing an apostrophe produces a doubled single quote in the generated command.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [x] On Windows, a spec whose title contains an apostrophe executes with the commit command enabled, and the full prompt reaches the CLI.

## Constraints
- Do not change the terminal launch strategy (plain terminal on Windows, bash script on POSIX).
- Do not add dependencies.
- Delivering the prompt via a file is covered by SDD-095. This spec only fixes quoting.

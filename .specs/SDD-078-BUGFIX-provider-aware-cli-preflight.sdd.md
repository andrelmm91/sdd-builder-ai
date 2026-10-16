---
spec_id: SDD-078-BUGFIX
title: Fix CLI pre-flight check to use the configured provider binary
status: ready
priority: high
complexity: low
tags:
  - rel-v2.0
  - bugfix
  - phase-1
  - backend
relevant_files:
  - src/commands/executeSpec.ts
  - src/execution/cliRunner.ts
  - src/config/extensionConfig.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliCommandBuilder.ts
  - src/execution/bulkExecution.ts
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
Spec execution always verifies that the Claude CLI binary (`sdd.claudeCliBinary`, default `claude`) is installed, regardless of the configured AI provider. Users who select the GitHub Copilot provider and do not have Claude installed are blocked with "Claude CLI not found" even though Copilot would be used.

**Current behavior:** `executeSingleSpec()` in `src/commands/executeSpec.ts` calls `isCommandAvailable(getClaudeCliBinary())` unconditionally. `CliRunner.execute()` in `src/execution/cliRunner.ts` repeats the same check with `config.claudeCliBinary`.

**Expected behavior:** The pre-flight check verifies the binary of the provider in the AI config (the Claude binary for provider `claude`, `gh` for provider `copilot`). The error message names that provider and binary.

**Root cause:** The check was written before Copilot support existed and never became provider-aware.

**Reproduce:** Set `ai.provider` to `copilot` in `.sdd/config.json` on a machine without `claude` on PATH, then execute a ready spec.

## Requirements
### Functional
- Add `getProviderBinary(aiConfig: Partial<AIConfig> | undefined): string` to `src/config/extensionConfig.ts`. It must return `getClaudeCliBinary()` for provider `claude` (or an undefined provider) and `gh` for provider `copilot`.
- `executeSingleSpec()` must read the AI config before the CLI availability check and check `getProviderBinary(aiConfig)` instead of the Claude binary.
- The error message must read `<Provider label> CLI not found: "<binary>". Install it or update your AI configuration.` For Claude it must still mention the `sdd.claudeCliBinary` setting.
- `CliRunner.execute()` must check the provider-specific binary using the same function so both checks are consistent.

### Non-Functional
- No change in behavior for Claude users.
- No additional process spawns compared with today.

## Acceptance Criteria
### Automated
- [ ] Unit tests for `getProviderBinary` cover `claude`, `copilot` and an undefined provider.
- [ ] A test in `src/commands/executeSpec.test.ts` or `src/execution/cliRunner.test.ts` asserts that with provider `copilot`, `isCommandAvailable` is called with `gh` and never with `claude`.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] With provider `copilot` and no Claude installed, executing a ready spec launches `gh copilot` instead of showing a Claude error.

## Constraints
- Do not change how the CLI command itself is built (`_buildCommand`).
- Do not add new VS Code settings.
- Do not modify `src/execution/cliCommandBuilder.ts` (covered by the provider refactor in SDD-102).

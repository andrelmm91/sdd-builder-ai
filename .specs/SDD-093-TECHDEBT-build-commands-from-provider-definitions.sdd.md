---
spec_id: SDD-093-TECHDEBT
title: Build CLI commands from provider definitions
status: draft
priority: medium
complexity: high
tags: [techdebt, phase-5, backend, rel-v2.0]
relevant_files:
  - src/execution/providerCommand.ts
  - src/execution/cliRunner.ts
  - src/execution/cliCommandBuilder.ts
  - src/commands/executeSpec.ts
must_not_touch:
  - src/extension.ts
  - src/config/providerTypes.ts
depends_on: [SDD-078-BUGFIX, SDD-090-NEW, SDD-092-NEW]
agent_skills: backend
created: 2026-10-15
---

## Context
SDD-091 and SDD-092 made providers data-driven, but `CliRunner._buildCommand()`, `buildCliCommand()` (used for the requirements AI) and `isInteractiveMode()`/`requireFullPermissionForBulk()` in `executeSpec.ts` still branch on `'claude'`/`'copilot'`. This spec replaces those branches with one generic builder so custom providers work end to end. Built-in providers must produce byte-identical commands to today.

## Requirements
### Functional
- Create `src/execution/providerCommand.ts` exporting:
  - `buildProviderCommand(def: ProviderDefinition, opts: { permissionModeId: string; prompt: string; model?: string; binaryOverride?: string; platform?: NodeJS.Platform }): { command: string; interactive: boolean }`. It resolves the permission mode, picks the `batch` or `interactive` args, substitutes `{prompt}`/`{model}` with values quoted by `quoteForShell` (from SDD-079), adds `modelArgs` when a model is set, and adds the mode's `extraArgs`.
  - `formatFileRef(def, path): string`.
  - `isBatchMode(def, permissionModeId): boolean`.
- `CliRunner._buildCommand()` uses these functions; `binaryOverride` carries `sdd.claudeCliBinary` for the `claude` provider.
- `buildCliCommand()` in `cliCommandBuilder.ts` delegates to `buildProviderCommand`, keeping its current exported signature.
- `isInteractiveMode()` and `requireFullPermissionForBulk()` use `isBatchMode()`. The bulk warning names the provider's batch-mode label instead of hard-coded strings.
- The pre-flight check from SDD-078 uses `def.binary` (or the override).

### Non-Functional
- Snapshot tests must prove that the built-in Claude and Copilot commands are unchanged for every permission mode on `linux` and `win32`.

## Acceptance Criteria
### Automated
- [ ] `src/execution/providerCommand.test.ts` covers built-in snapshots for all permission modes and platforms, a custom provider, a model inserted only when set, and an unknown permission mode (falls back to the first mode).
- [ ] Existing `cliRunner.test.ts`, `executeSpec.test.ts`, `createSddCards.test.ts` and `idealizeRequirements.test.ts` pass unchanged or with snapshot-equivalent updates.
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] A custom provider configured as in the SDD-092 example appears in the terminal with the expected command.

## Constraints
- Do not change provider definitions or their loading.
- Do not change terminal launch mechanics or prompt file delivery.

---
spec_id: SDD-091-NEW
title: Define data-driven AI provider definitions with built-in Claude and Copilot
status: review
priority: medium
complexity: medium
tags:
  - feature
  - phase-5
  - backend
  - rel-v2.0
relevant_files:
  - src/config/providerTypes.ts
  - src/config/aiConfigTypes.ts
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/execution/cliCommandBuilder.ts
depends_on:
  - SDD-102-BUGFIX
agent_skills: backend
created: 2026-10-15
---

## Context
Providers are hard-coded as `'claude' | 'copilot'`, with `if (provider === 'copilot')` branches in `cliRunner.ts`, `cliCommandBuilder.ts` and `executeSpec.ts`. Supporting another agent CLI (Codex, Gemini CLI, Cursor agent, Aider, OpenCode and so on) requires code changes and a release.

This spec introduces a declarative `ProviderDefinition` and expresses the two built-in providers as data. Later specs load custom definitions (SDD-092), build commands from definitions (SDD-093) and show them in the UI (SDD-094).

## Requirements
### Functional
- Create `src/config/providerTypes.ts` exporting:
  - `ProviderDefinition`:
    - `id: string`, `label: string`, `binary: string`
    - `fileRefFormat: string`, for example `@{path}` or `#file:{path}`
    - `batch?: { args: string[] }`: non-interactive invocation. Args may contain the placeholders `{prompt}` and `{model}`. Omitted means the provider has no unattended mode.
    - `interactive?: { args: string[] }`: interactive REPL invocation, same placeholders.
    - `modelArgs?: string[]`: for example `['--model', '{model}']`, included only when a model is set.
    - `models?: string[]`: suggested models for the UI.
    - `permissionModes: { id: string; label: string; mode: 'batch' | 'interactive'; extraArgs?: string[] }[]`
  - `BUILTIN_PROVIDERS: ProviderDefinition[]`, containing `claude` and `copilot`. Their `models` must come from `BUILTIN_MODELS` (added in SDD-102), not from a new hard-coded copy. They must reproduce exactly the commands produced today by `CliRunner._buildCommand()`: Claude `-p --dangerously-skip-permissions` for batch and the plain prompt for interactive; Copilot `gh copilot --yolo -p` for batch and the positional prompt for interactive.
  - `getProviderDefinition(id: string, custom?: ProviderDefinition[]): ProviderDefinition | undefined`. Custom definitions override built-ins with the same `id`.
  - `PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/` and `BINARY_PATTERN = /^[A-Za-z0-9._\/\\:-]{1,200}$/` (no spaces, quotes or shell metacharacters; a path is allowed).
  - `ProviderValidationError { path: string; message: string }`, where `path` names the offending field (`binary`, `batch.args[2]`, `permissionModes[1].extraArgs[0]` and so on) so the AI Config form (SDD-104) can show the error beside the field.
  - `validateProviderDefinition(def: unknown): ProviderValidationError[]`: an empty array when valid. It is the single source of truth for provider validity, used when loading (SDD-092), when saving from the UI (SDD-092/SDD-104) and for the form's live feedback. Rules:
    - `id` matches `PROVIDER_ID_PATTERN`; `label` is a non-empty string of at most 60 characters; `binary` matches `BINARY_PATTERN`.
    - `fileRefFormat` contains `{path}` exactly once.
    - At least one of `batch` or `interactive` is present. Each present invocation has `args` as an array of strings, and contains `{prompt}` exactly once across its args (the prompt file instruction from SDD-090 must reach the CLI).
    - Args, `modelArgs` and `extraArgs` contain no placeholder other than `{prompt}` and `{model}`; `{prompt}` is not allowed in `modelArgs` or `extraArgs`; `modelArgs`, when present, contains `{model}`.
    - No arg is empty or contains a newline.
    - `permissionModes` is non-empty, ids match `PROVIDER_ID_PATTERN` and are unique, labels are non-empty, `mode` is `'batch'` or `'interactive'`, and the matching invocation exists.
    - Every entry of `models` matches `MODEL_ID_PATTERN` (from SDD-103), with no duplicates.
  - `validateProviderList(defs: unknown[]): ProviderValidationError[]`: runs `validateProviderDefinition` on each entry (paths prefixed with `[index].`) and also reports duplicate `id`s.
  - `resolveProviderModels(def: ProviderDefinition, userModels?: Record<string, string[]>): string[]`: applies the model precedence from SDD-102. A non-empty `userModels[def.id]` (from `ai.models` in `.sdd/config.json`) replaces `def.models`; otherwise it returns `def.models ?? []`. The user's list always takes precedence over built-in and custom-provider lists.
- In `src/config/aiConfigTypes.ts`, widen `AIProvider` to `string`, keep `'claude'` and `'copilot'` exported as `BUILTIN_PROVIDER_IDS`, and keep all existing constants working.

### Non-Functional
- Pure data and functions; no VS Code API.
- Existing type-checks across the codebase must still pass after widening `AIProvider`.

## Acceptance Criteria
### Automated
- [x] `src/config/providerTypes.test.ts` covers the shape of the built-ins (models equal to `BUILTIN_MODELS`), `resolveProviderModels` with and without user models, custom definitions overriding built-ins, an unknown id, and validation errors with their `path` (missing binary, a binary with a space, a bad id, `fileRefFormat` without `{path}`, an invocation without `{prompt}`, an unknown placeholder, `{prompt}` in `extraArgs`, a mode without a matching invocation, duplicate mode ids, a non-string arg, an invalid model id) and `validateProviderList` reporting duplicate provider ids. Both built-ins pass validation.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

## Constraints
- Do not change any command-building code in this spec.
- Builder decision: GitHub's newer agentic Copilot CLI ships as a standalone `copilot` binary, separate from the `gh copilot` extension. Verify which invocation the built-in Copilot definition should use before promoting to `ready`. This spec preserves today's `gh copilot` behavior.

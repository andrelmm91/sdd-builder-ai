---
spec_id: SDD-052
title: Make execution pipeline config-aware
status: done
priority: high
complexity: high
tags: [phase-2, backend, ai-config]
relevant_files:
  - src/execution/cliRunner.ts
  - src/execution/contextAssembler.ts
  - src/commands/executeSpec.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-048]
agent_skills: backend-dev
created: 2026-03-08
---

## Context

The execution pipeline currently hardcodes Claude CLI as the provider with no permission flags, uses a fixed context assembly, and has a hardcoded prompt structure. This spec modifies the execution pipeline to read the global AI configuration and apply it. The AI config persistence layer (SDD-048) provides `readAIConfig()` to load settings.

The three key integration points are:
1. **CliRunner** — must support both Claude CLI and Copilot CLI, with configurable permission flags and model selection
2. **ContextAssembler** — must apply tag-to-skill mapping (load skills based on spec tags instead of the spec's `agent_skills` field) and use the custom pre-prompt template
3. **executeSpec command** — must read AI config at execution start and pass it through the pipeline

## Requirements

### Functional
- Modify `CliRunner.execute()` to accept an optional `AIConfig` parameter:
  - When provider is `'claude'`: use `claude` CLI with `--print --max-tokens {N}` (existing behavior), plus `--model {model}` flag, plus permission flag (`--dangerously-skip-permissions` or `--plan` if configured, omit for `'default'`)
  - When provider is `'copilot'`: use `github copilot` CLI equivalent command structure, with `--yolo` flag if configured
  - Default behavior (no AIConfig passed) must remain unchanged for backward compatibility
- Modify `assembleExecutionContext()` to accept an optional `AIConfig` parameter:
  - If `tagSkillMappings` are configured and the spec has matching tags, load the mapped skills instead of the spec's `agent_skills` skill
  - If `prePromptTemplate` is set and non-empty, use it as the prompt wrapper instead of the default, replacing `{spec_file}` with the spec filename
  - Append skill content sections for all matched tag-skill mappings
- Modify `executeSpec` command to:
  - Read AI config via `readAIConfig()` at the start of execution
  - Pass config to `assembleExecutionContext()` and `CliRunner.execute()`

### Non-Functional
- Backward compatible — all existing behavior must work when no AI config file exists
- No breaking changes to function signatures — use optional parameters or overloads

## Acceptance Criteria

### Automated
- [ ] Unit tests pass for CliRunner with Claude provider (default and with permission flags)
- [ ] Unit tests pass for CliRunner with Copilot provider
- [ ] Unit tests pass for contextAssembler with tag-skill mapping
- [ ] Unit tests pass for contextAssembler with custom pre-prompt
- [ ] Existing tests continue to pass
- [ ] TypeScript compilation succeeds

### Manual
- [ ] Executing a spec with Claude provider configured uses Claude CLI with correct flags
- [ ] Tag-skill mappings override the spec's built-in agent_skills when matching tags exist

## Constraints
- Do not change the execution result format or storage — only the CLI invocation and context assembly change
- Do not add new npm dependencies
- Preserve all existing error handling and cancellation logic

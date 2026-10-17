---
spec_id: SDD-095-NEW
title: Run a single spec with a different model from the Kanban Execute button
status: done
priority: medium
complexity: medium
tags:
  - feature
  - phase-5
  - ui
  - rel-v2.0
relevant_files:
  - src/commands/executeSpec.ts
  - src/views/webviews/kanban/KanbanPanel.ts
  - webview-ui/src/kanban/Kanban.svelte
must_not_touch:
  - src/extension.ts
  - src/execution/cliRunner.ts
  - src/specs/types.ts
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on:
  - SDD-093-TECHDEBT
  - SDD-096-NEW
agent_skills: frontend
created: 2026-10-15
---

## Context
Every spec runs with the model set in AI Configuration. Builders often want to run one simple spec on a cheaper or faster model without opening AI Configuration, changing the model, running and changing it back.

This spec replaces an earlier version of SDD-095 that added `provider`, `model` and `timeout_minutes` frontmatter fields. That approach was dropped: the values were hidden in the spec file and not chosen by the builder at run time. The complexity-based timeout from SDD-096 and the timeout multiplier field from SDD-100 stay.

## Requirements
### Functional
**Execution (`src/commands/executeSpec.ts`)**
- Export `ExecuteOptions { model?: string }` and accept it as an optional third argument of `executeSingleSpec(filePath, refresh?, options?)`. The `sdd.executeSpec` command passes a second argument through as `options`.
- Export `applyRunOverrides(base, options)`: returns `base` unchanged when there is no model or it equals `base.model`; otherwise returns a copy with `model` replaced. It throws `Invalid model id: "<id>"` when the id does not match `MODEL_ID_PATTERN`; `executeSingleSpec` shows that error and does not run.
- Provider and permission mode always come from AI Configuration. Nothing is written to `.sdd/config.json` or the spec file.
- The progress title shows the model only when it was overridden: `Executing SDD-042 (haiku)`.
- The timeout stays complexity-based (SDD-096). The timeout error reads `Execution timed out after N minutes. Increase the execution timeout multiplier in AI Configuration.`

**Kanban panel (`KanbanPanel.ts`)**
- `specList` also carries `runModels { providerLabel, defaultModel, models }` for the provider currently selected in AI Configuration, with models resolved by `getAvailableProviders()` (user `ai.models` first).
- A `cardAction` with `action: 'execute'` may carry `model`; the panel forwards it as `{ model }` to `sdd.executeSpec`. Interactive-run tracking is unchanged.

**Kanban board (`Kanban.svelte`)**
- On Ready cards, Execute becomes a split button: the main part runs with the AI Config model exactly as before (tooltip `Execute with <model> (AI Config)`); a ▾ part opens a "Run once with (<provider>)" menu inside the card.
- The menu lists the AI Config default first (marked `AI Config default`), then the provider's other models. Choosing the default sends a plain execute; choosing another sends `model`.
- With no models listed, the menu says so and points to AI Configuration → Model Lists.
- A footer says `Only this run uses the chosen model. Your AI Config is not changed.`
- Opening the menu requests a refresh so model changes made in AI Configuration appear; Escape or clicking ▾ again closes it. Clicks inside the menu do not start a drag.

### Non-Functional
- Clicking the main Execute part behaves exactly as before.
- Bulk execution always uses the AI Config model.

## Acceptance Criteria
### Automated
- [x] `src/commands/executeSpec.test.ts` covers: a run with a chosen model (provider and permission mode unchanged, title shows the model), the AI Config model treated as no override, an invalid model id rejected without running, the complexity timeout with the multiplier, the timeout error text, and no options.
- [x] `npm run build:webview` succeeds.
- [x] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] Choosing `haiku` from the ▾ menu of a Ready card launches the CLI with `--model haiku` while AI Configuration still says `sonnet`, and the next plain Execute uses `sonnet` again.
- [ ] Adding a model in Model Lists and reopening the ▾ menu shows it.

## Constraints
- Do not add model, provider or timeout fields to the spec frontmatter.
- Do not change permission mode or provider per run.
- Do not change bulk execution.

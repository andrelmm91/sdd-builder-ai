---
spec_id: SDD-076
title: Add FeatureStatus validation and use PRODUCT_FOLDER constant
status: done
priority: medium
complexity: low
tags: [phase-2, bugfix, backend]
relevant_files:
  - src/views/webviews/requirementBoard/featureParser.ts
  - src/commands/idealizeRequirements.ts
  - src/commands/createSddCards.ts
  - src/utils/constants.ts
must_not_touch:
  - src/views/webviews/requirementBoard/types.ts
depends_on: [SDD-072]
agent_skills: backend-dev
created: 2026-03-09
---

## Context

Multiple small issues that should be fixed together:

### Issue 1: No FeatureStatus validation
`featureParser.ts:16` casts `result.data['status'] as FeatureStatus` without checking if the value is actually one of the three valid statuses (`'Feature Backlog' | 'Idealization In Review' | 'SDD Created'`). If a feature file contains an invalid status like `"in_progress"` or a typo like `"Feature backlog"` (lowercase), the card gets a status that matches no column and silently disappears from the board.

### Issue 2: Hardcoded `.sdd/product/` path
`idealizeRequirements.ts:32` constructs the feature file path as `.sdd/product/${featureName}/${featureName}.md` using a hardcoded string instead of the `PRODUCT_FOLDER` constant from `src/utils/constants.ts`. Same issue in `createSddCards.ts:34`.

### Issue 3: `displayFilePath!` non-null assertion
`featureParser.ts:73` uses `displayFilePath!` with a definite assignment assertion. While logically safe, it can be trivially eliminated by restructuring the code.

## Requirements

### Functional

**Status validation (`featureParser.ts`):**
- Import `FEATURE_STATUSES` from `src/utils/constants.ts`
- In `parseFeatureFile()`, validate the parsed status against `FEATURE_STATUSES`. If invalid, default to `'Feature Backlog'`
- Implementation: `const rawStatus = result.data['status'] as string; const status: FeatureStatus = FEATURE_STATUSES.includes(rawStatus as FeatureStatus) ? (rawStatus as FeatureStatus) : 'Feature Backlog';`

**Constant usage (`idealizeRequirements.ts` and `createSddCards.ts`):**
- Import `PRODUCT_FOLDER` from `src/utils/constants.ts`
- Replace hardcoded `.sdd/product/` strings with the `PRODUCT_FOLDER` constant
- `idealizeRequirements.ts:32`: change `\`.sdd/product/${featureName}/${featureName}.md\`` to `` `${PRODUCT_FOLDER}/${featureName}/${featureName}.md` ``
- `createSddCards.ts:34`: change `\`.sdd/product/${featureName}/${IDEALIZATION_FILENAME}\`` to `` `${PRODUCT_FOLDER}/${featureName}/${IDEALIZATION_FILENAME}` ``

**Remove non-null assertion (`featureParser.ts`):**
- Refactor `loadFeatureCards()` to initialize `displayFilePath` as `''` and set it in both branches, or restructure to avoid the `!` assertion. One approach: move the `cards.push()` into both the idealization and feature-file branches

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] All existing tests pass (`npm test`)
- [ ] Add a test case: `parseFeatureFile` with invalid status defaults to `'Feature Backlog'`
- [ ] No `!` non-null assertions remain in `featureParser.ts`

### Manual
- [ ] A feature file with a typo in status (e.g., `"feature backlog"`) still appears in the Feature Backlog column
- [ ] Idealize and create-SDD commands still construct correct file paths

## Constraints
- Do not modify `types.ts` — `FeatureStatus` type definition stays the same
- Keep changes minimal — validation, constant import, and assertion removal only

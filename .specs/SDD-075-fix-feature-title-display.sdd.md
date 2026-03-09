---
spec_id: SDD-075
title: Store and display human-readable feature title
status: ready
priority: medium
complexity: medium
tags: [phase-2, bugfix, ui, backend]
relevant_files:
  - src/views/webviews/requirementBoard/featureParser.ts
  - src/views/webviews/requirementBoard/types.ts
  - webview-ui/src/requirementBoard/RequirementBoard.svelte
must_not_touch:
  - src/views/webviews/requirementBoard/RequirementBoardPanel.ts
depends_on: [SDD-064]
budget_max_tokens: 80000
agent_skills: fullstack-dev
created: 2026-03-09
---

## Context

When a user creates a feature via the form with name "User Authentication", the system:
1. Sanitizes it to `user_authentication` (folder + file name)
2. Stores the description, acceptance criteria, and notes in the markdown body
3. But **never stores the original human-readable name** in the frontmatter

The `FeatureCard.title` field is set to `entryName` (the sanitized folder name) at `featureParser.ts:72`, so the board shows `user_authentication` instead of `User Authentication`.

## Requirements

### Functional

**Types (`types.ts`):**
- Add `title` as an optional field in the `FeatureData` interface: `title?: string`

**Feature creation (`featureParser.ts` → `createFeatureFile`):**
- Store the original `formData.name` (unsanitized) as `title` in the YAML frontmatter alongside `status` and `date`

**Feature loading (`featureParser.ts` → `loadFeatureCards`):**
- When building `FeatureCard`, read `title` from the parsed frontmatter (`data.title`)
- Use `data.title` if available, otherwise fall back to `entryName` (backwards compatible with existing features that don't have a title field)

**Feature parsing (`featureParser.ts` → `parseFeatureFile`):**
- Parse `title` from frontmatter in `FeatureData`: `title: (result.data['title'] as string) ?? undefined`

**Svelte UI (`RequirementBoard.svelte`):**
- No changes needed — it already renders `card.title || card.name` (line 94), so once `title` is populated with the human-readable name, it will display correctly

### Non-Functional
- Backwards compatible — existing feature folders without a `title` frontmatter field gracefully fall back to the folder name

## Acceptance Criteria

### Automated
- [ ] TypeScript compilation passes (`npm run type-check`)
- [ ] Existing `featureParser.test.ts` tests still pass
- [ ] Add a test case for `parseFeatureFile` that verifies `title` is parsed from frontmatter
- [ ] Add a test case for `createFeatureFile` that verifies `title` is written to frontmatter

### Manual
- [ ] Creating a new feature "My Cool Feature" shows "My Cool Feature" as the card title (not `my_cool_feature`)
- [ ] Existing features without `title` in frontmatter still display with their folder name

## Constraints
- Maximum 3 files modified (types.ts, featureParser.ts, featureParser.test.ts)
- Do not rename existing folders or files — this only adds a `title` field to frontmatter going forward

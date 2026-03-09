---
spec_id: SDD-064
title: Create feature file parser utility
status: done
priority: high
complexity: medium
tags: [phase-2, backend]
relevant_files:
  - src/utils/frontmatter.ts
  - src/utils/constants.ts
  - src/views/webviews/requirementBoard/types.ts
must_not_touch:
  - src/specs/specParser.ts
depends_on: [SDD-063]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-09
---

## Context

The Requirement Board needs to scan `.sdd/product/` subdirectories, parse feature and idealization markdown files, and determine which file to display on the board based on the display rules defined in the idealization document. This spec creates a `featureParser.ts` utility that handles all file I/O and parsing for feature files.

This builds on the existing `parseFrontmatter` and `serializeFrontmatter` utilities in `src/utils/frontmatter.ts` and uses the types defined in SDD-063.

## Requirements

### Functional
- Create `src/views/webviews/requirementBoard/featureParser.ts` with the following functions:
- `parseFeatureFile(content: string): { data: FeatureData; body: string }` — parse a feature or idealization markdown file using the existing `parseFrontmatter` utility
- `loadFeatureCards(productFolderUri: vscode.Uri): Promise<FeatureCard[]>` — scan `.sdd/product/` subdirectories, apply board display rules, and return an array of `FeatureCard` objects:
  - Only scan subdirectories (ignore loose files like `Idea_1_SDD_VSCode_Extension.md`)
  - For each subfolder, check if `idealization.md` exists
  - If `idealization.md` exists: use its status for column placement, set `hasIdealization: true`
  - If no `idealization.md`: parse `{feature_name}.md`, show only if status is `"Feature Backlog"`
  - Card title = folder name (the `feature_name`)
- `createFeatureFile(productFolderUri: vscode.Uri, formData: FeatureFormData): Promise<string>` — create the folder `.sdd/product/{sanitized_name}/` and write `{sanitized_name}.md` with YAML frontmatter (`status: "Feature Backlog"`, `date: today`) and markdown body sections (Description, Acceptance Criteria, Notes). Return the created file path.
- `updateFeatureStatus(filePath: vscode.Uri, newStatus: FeatureStatus): Promise<void>` — read a feature/idealization file, update its `status` and `date` frontmatter fields, and write it back using `serializeFrontmatter`
- `sanitizeFeatureName(name: string): string` — lowercase, replace spaces with underscores, remove special characters (keep alphanumeric and underscores only)

### Non-Functional
- Reuse existing `parseFrontmatter` and `serializeFrontmatter` from `src/utils/frontmatter.ts`
- Use `vscode.workspace.fs` API for all file operations (not Node.js `fs`)
- Handle missing or malformed files gracefully (skip with warning, don't crash)

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes (`npm run type-check`)
- [x] Unit tests pass for `sanitizeFeatureName` covering: spaces, special characters, mixed case, already-clean names
- [x] Unit tests pass for `parseFeatureFile` with valid frontmatter
- [x] Unit tests pass for board display rule logic (idealization exists vs. not)

### Manual
- [ ] Files directly in `.sdd/product/` (not in subdirectories) are correctly ignored

## Constraints
- Do not modify `frontmatter.ts` — only import from it
- Do not create any VS Code commands or UI — this is a pure utility module
- Feature name sanitization must produce valid filesystem folder names

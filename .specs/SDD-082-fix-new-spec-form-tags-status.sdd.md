---
spec_id: SDD-082
title: Fix new spec form — tags serialize as inline array and status locked to draft
status: done
priority: high
complexity: low
tags: [phase-2, bugfix, fullstack]
relevant_files:
  - src/views/webviews/specForm/SpecFormPanel.ts
  - src/utils/frontmatter.ts
  - webview-ui/src/specForm/SpecForm.svelte
must_not_touch:
  - src/specs/parser.ts
  - src/specs/validator.ts
depends_on: []
budget_max_tokens: 80000
agent_skills: fullstack-dev
created: 2026-03-10
---

## Context

Three bugs exist in the new spec creation flow via the spec form:

**Bug 1: Tags serialize as YAML block sequence (bullet points) instead of inline array.**
`serializeFrontmatter` calls `yamlStringify(data)` from the `yaml` library. The library serializes JavaScript arrays as YAML block sequences by default:
```yaml
tags:
  - phase-2
  - bugfix
```
But the SDD format requires inline array syntax: `tags: [phase-2, bugfix]`.

**Bug 2: Tags entered in the form are not passed to the spec file.**
In `SpecForm.svelte`, tags are managed as a `tags: string[]` state. In the `save()` function, tags are included in `formData`. The tags may arrive as empty due to Svelte 5 proxy stripping issues.

**Bug 3: New spec should only allow "draft" status.**
When creating a new spec (`mode === 'create'`), the status selector should be locked to `draft`. On edit, all status transitions remain available.

## Requirements

### Functional
- Fix tag serialization: in `serializeSpecDocument` (or `serializeFrontmatter`), ensure `tags` arrays are written as YAML inline flow sequences: `tags: [phase-2, bugfix]`. Use the `yaml` library's flow style option, or manually serialize the tags field as an inline array string.
- Verify that the `tags` array from the Svelte form is correctly passed through `JSON.parse/JSON.stringify` and arrives as a plain `string[]` in `SpecFormPanel.handleSave`. Add a guard to ensure it's always an array before serialization.
- In `SpecForm.svelte`, when `mode === 'create'`, disable the status `<select>` element and always send `status: 'draft'` in the form data. When `mode === 'edit'`, keep the status dropdown enabled.

### Non-Functional
- No change to the file-parsing path (parser must still accept both block and flow YAML arrays)
- TypeScript compilation passes

## Acceptance Criteria

### Automated
- [ ] `npm run type-check` passes

### Manual
- [ ] Creating a new spec with tags "phase-2" and "bugfix" results in `tags: [phase-2, bugfix]` in the file (flow style, not bullet points)
- [ ] Tags entered in the form appear in the saved spec file
- [ ] New spec form shows "draft" as the only selectable status when in create mode
- [ ] Editing an existing spec still allows status changes

## Constraints
- Do not modify `parseFrontmatter` — only `serializeFrontmatter` or the call-site in `SpecFormPanel.ts`
- The fix for tags serialization must be confined to `SpecFormPanel.ts` or `frontmatter.ts`

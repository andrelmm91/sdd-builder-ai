---
spec_id: SDD-088-NEW
title: Create a dependency-free glob matcher utility
status: draft
priority: high
complexity: low
tags: [feature, phase-3, backend, rel-v2.0]
relevant_files:
  - src/utils/glob.ts
must_not_touch:
  - src/extension.ts
  - package.json
depends_on: []
agent_skills: backend
created: 2026-10-15
---

## Context
Spec frontmatter lists paths in `relevant_files` and `must_not_touch`. Today these are compared by exact string equality, so builders cannot protect a whole folder (for example `src/auth/**`) or a file pattern (for example `**/*.env`). Scope enforcement (SDD-089) needs glob matching.

The extension targets VS Code 1.85, which bundles Node 18, so `path.matchesGlob` is not available. The project avoids new runtime dependencies, so this spec adds a small internal matcher.

## Requirements
### Functional
- Create `src/utils/glob.ts` exporting:
  - `globToRegExp(pattern: string): RegExp`
  - `matchesGlob(filePath: string, pattern: string): boolean`
  - `matchesAny(filePath: string, patterns: string[]): boolean`
- Supported syntax:
  - `*`: any characters except `/`
  - `**`: any characters including `/`, matching zero or more path segments (`src/**/x.ts` matches `src/x.ts`)
  - `?`: exactly one character except `/`
  - `{a,b}`: alternation (no nesting required)
  - A pattern without glob characters matches by exact path. A pattern ending in `/` matches everything under that directory.
- Both the path and the pattern are normalized: backslashes become `/`, a leading `./` is removed, and the comparison is case-sensitive.
- Regex special characters in patterns (`.`, `+`, `(`, `)`, `[`, `]`, `^`, `$`, `|`) are escaped literally.

### Non-Functional
- Pure functions with no I/O and no dependencies.
- Compile each pattern once per call to `matchesAny`.

## Acceptance Criteria
### Automated
- [ ] `src/utils/glob.test.ts` covers exact match, `*`, `**` at the start, middle and end, `?`, `{a,b}`, a trailing `/` directory pattern, a Windows backslash path, a leading `./`, and literal dots (`a.ts` must not match `abts`).
- [ ] `npm test`, `npm run type-check` and `npm run lint` pass.

### Manual
- [ ] None.

## Constraints
- Do not add dependencies to `package.json`.
- Do not use this utility anywhere else in this spec.

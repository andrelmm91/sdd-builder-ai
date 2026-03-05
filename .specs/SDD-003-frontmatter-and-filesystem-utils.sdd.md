---
spec_id: SDD-003
title: Create frontmatter parser and file system utilities
status: done
priority: high
complexity: medium
tags: [phase-0, backend]
relevant_files:
  - src/utils/frontmatter.ts
  - src/utils/fileSystem.ts
  - src/specs/types.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-002]
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-03-05
---

## Context

Most modules need to read/write YAML frontmatter from `.sdd.md` files and perform workspace file operations. These two utilities are shared infrastructure used by the parser, validator, config manager, and execution engine. The frontmatter module handles YAML ↔ object serialization. The file system module wraps VS Code workspace file operations.

## Requirements

### Functional
- `src/utils/frontmatter.ts` must export:
  - `parseFrontmatter(content: string): { data: Record<string, unknown>; body: string }` — extracts YAML between `---` delimiters and returns parsed data + remaining markdown body
  - `serializeFrontmatter(data: Record<string, unknown>, body: string): string` — converts object back to YAML frontmatter + markdown body
  - Must handle edge cases: missing frontmatter, empty body, malformed YAML (return error, don't throw)
- `src/utils/fileSystem.ts` must export:
  - `readWorkspaceFile(relativePath: string): Promise<string | undefined>` — reads a file relative to workspace root
  - `writeWorkspaceFile(relativePath: string, content: string): Promise<void>` — writes a file relative to workspace root, creating directories as needed
  - `listFiles(pattern: string): Promise<string[]>` — glob files in workspace using VS Code `workspace.findFiles`
  - `getWorkspaceRoot(): string | undefined` — returns the workspace root path
  - `fileExists(relativePath: string): Promise<boolean>` — checks if a file exists in workspace

### Non-Functional
- Frontmatter parser must handle files up to 100KB without performance issues
- File system utilities must use VS Code workspace API (not raw `fs`) for portability

## Acceptance Criteria

### Automated
- [x] Unit tests pass for frontmatter parsing: valid YAML, missing frontmatter, empty body, malformed YAML
- [x] Unit tests pass for frontmatter serialization round-trip (parse → serialize → parse yields same data)
- [x] TypeScript compilation passes

### Manual
- [x] File system utilities work in Extension Development Host

## Constraints
- Must add `yaml` npm package for YAML parsing (do not hand-roll YAML parser)
- Do not add any VS Code UI interactions — these are pure utilities

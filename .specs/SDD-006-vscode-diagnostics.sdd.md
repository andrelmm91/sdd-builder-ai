---
spec_id: SDD-006
title: Create VS Code diagnostics provider for spec validation
status: done
priority: high
complexity: medium
tags: [phase-0, frontend]
relevant_files:
  - src/specs/diagnostics.ts
  - src/specs/validator.ts
  - src/specs/parser.ts
must_not_touch:
  - src/extension.ts
depends_on: [SDD-004, SDD-005]
budget_max_tokens: 100000
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

VS Code's diagnostics system shows errors and warnings as red/yellow squiggles in the editor and lists them in the Problems panel. This spec wires the spec validator (SDD-005) to VS Code's `DiagnosticCollection` so that `.sdd.md` files are validated on open and on save, with errors displayed inline.

## Requirements

### Functional
- `src/specs/diagnostics.ts` must export:
  - `SpecDiagnosticsProvider` class that:
    - Creates a `vscode.DiagnosticCollection` named "sdd"
    - Registers listeners for `onDidOpenTextDocument`, `onDidSaveTextDocument`, and `onDidChangeTextDocument` (debounced) that trigger validation on `.sdd.md` files
    - Parses the document content using the spec parser
    - Validates using the spec validator
    - Maps `ValidationError` entries to `vscode.Diagnostic` objects with appropriate severity (`error` → `DiagnosticSeverity.Error`, `warning` → `DiagnosticSeverity.Warning`)
    - Attempts to map errors to approximate line ranges in the document (frontmatter errors map to frontmatter lines, section errors map to section header lines)
    - Clears diagnostics when a `.sdd.md` file is closed
  - `activate(context: vscode.ExtensionContext): void` — convenience function to create and register the provider
  - `dispose(): void` — cleanup

### Non-Functional
- Validation must be debounced (300ms) on `onDidChangeTextDocument` to avoid excessive computation during typing
- Must only trigger on files matching `*.sdd.md` pattern

## Acceptance Criteria

### Automated
- [x] TypeScript compilation passes
- [ ] Unit tests pass: diagnostics are generated for invalid specs
- [ ] Unit tests pass: diagnostics are cleared when document is valid

### Manual
- [ ] Red squiggles appear in VS Code when a `.sdd.md` file has validation errors
- [ ] Problems panel shows spec validation errors with descriptive messages
- [ ] Errors update live as the user edits the file

## Constraints
- Must use VS Code `DiagnosticCollection` API — do not use custom decorations
- Do not modify parser.ts or validator.ts — only import from them

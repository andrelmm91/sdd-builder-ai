# Implementation Audit: SDD-001 through SDD-030

> Audit date: 2026-03-06
> Scope: All implemented specs SDD-001 to SDD-030
> TypeScript: no compile errors

This document captures issues found in the implementation relative to specs,
organized by severity for phased remediation.

---

## Phase 1 — Critical Fixes (Correctness Blockers)

These issues cause features to be silently inoperative or produce wrong data.

### 1. Diagnostics never wired into the extension (SDD-006)

`SpecDiagnosticsProvider` is defined in `src/specs/diagnostics.ts` but never
imported or registered in `src/extension.ts`. Editor squiggles and the Problems
panel are completely inoperative at runtime.

**Fix:** Import `activate` from `src/specs/diagnostics.ts` and call it inside
the extension's `activate()` function.

Note: `diagnostics.ts` `activate()` also returns `SpecDiagnosticsProvider`
instead of `void` — the signature needs to be aligned with the spec.

---

### 2. `getReadyToExecute` returns wrong specs (SDD-020)

`src/planning/dependencyResolver.ts` filters `status !== 'done'` instead of
`status === 'ready'`. This causes `in_progress` and `review` specs to be
returned as candidates for execution.

**Fix:** Change filter to `spec.status === 'ready'`.

---

### 3. Partial results not saved on execution failure (SDD-030)

The `catch` block in `src/commands/executeSpec.ts` only reverts the spec status
to `ready` and shows an error — it never calls `captureResults()`. Diagnostic
data (tokens used, duration, etc.) is lost whenever an execution fails.

The cancellation path correctly calls `captureResults()`, but the error path
does not.

**Fix:** Call `captureResults()` in the catch block before reverting status.

---

### 4. `reviewSpec` context menu on wrong status (SDD-030)

In `package.json`, `sdd.reviewSpec` appears when `viewItem == 'in_progress'`.
The lifecycle is `in_progress → review`, so the review action should appear
when `viewItem == 'review'`.

**Fix:** Update the `when` clause in `package.json` to `viewItem == 'review'`.

---

## Phase 2 — Spec Compliance (Behavioral Deviations)

These issues cause the implementation to behave differently from what the spec
defines, without being immediate correctness blockers.

### 5. Skills loading is inconsistent across three callers (SDD-022, SDD-024)

`skillsLoader.ts` (SDD-025) implements the canonical search order:
1. `.sdd/skills/{name}/SKILL.md`
2. `.sdd/skills/{name}.md`
3. `.claude/skills/{name}/SKILL.md`
4. `.claude/skills/{name}.md`

But two callers bypass it:

- `src/planning/planner.ts` — has its own `SKILLS_CANDIDATES` array with only
  2 paths, missing the subdirectory variants.
- `src/execution/contextAssembler.ts` — reads skills directly via
  `readWorkspaceFile(\`${SKILLS_FOLDER}/${fm.agent_skills}.md\`)`, missing the
  `.claude/skills/` fallback entirely.

Skills files in non-default locations will silently not load for these callers.

**Fix:** Replace custom skills-finding logic in `planner.ts` and
`contextAssembler.ts` with calls to `loadSkills()` from `skillsLoader.ts`.

---

### 6. Ajv not used for frontmatter validation (SDD-005)

SDD-005 explicitly requires Ajv for JSON Schema validation. `ajv` is in
`package.json` dependencies but is never imported. All validation in
`src/specs/validator.ts` is done with manual if-statements.

**Fix:** Define a JSON Schema for `SpecData` frontmatter and use Ajv to
validate it. Replace or augment the current manual checks.

---

### 7. `refine()` is identical to `plan()` in planner (SDD-022)

Both `plan()` and `refine()` in `src/planning/planner.ts` call the same
`runPipeline()` with no difference in behavior. The spec says `refine()` should
re-run planning with feedback from a prior attempt.

**Fix:** Make `refine()` incorporate the `PlanningRequest.feedback` field into
the prompt or context before invoking the CLI.

---

### 8. CLI runner uses `child_process` instead of VS Code Terminal API (SDD-026)

SDD-026 requires using the VS Code Terminal API for spawning. The implementation
uses a `Pseudoterminal` for display output but spawns the actual process with
`cp.spawn()` from `child_process`. The spec constraint is "Must use VS Code
Terminal API for spawning — not raw `child_process`".

**Fix:** Use `vscode.window.createTerminal` with a `TerminalOptions` shell
command, or document the rationale for the Pseudoterminal hybrid approach and
update the spec if the hybrid is intentional.

---

### 9. Execution timeout is not configurable (SDD-026)

`DEFAULT_TIMEOUT_MS` in `src/execution/cliRunner.ts` is hardcoded at 10 minutes
with no way for callers to override it. The spec requires a configurable
timeout.

**Fix:** Accept an optional `timeoutMs` field in `ExecutionConfig` and pass it
through to `cliRunner`.

---

### 10. Empty status groups hidden in spec tree (SDD-013)

`src/views/sidebar/specTreeProvider.ts` filters out status groups with 0 specs.
The spec requires all 5 status groups to always be visible with count badges
(e.g., "Draft (0)") so users can see the complete lifecycle at a glance.

**Fix:** Remove the `.filter()` that excludes empty groups. Show all status
groups, with count 0 when empty.

---

### 11. `captureResults` signature deviation (SDD-028)

Spec defines: `captureResults(specId: string, executionResult: ExecutionResult): Promise<CaptureResult>`

Implementation has a 3rd param: `mustNotTouch: string[] = []`. This shifts
responsibility for providing the `must_not_touch` list to the caller rather
than the function reading it from the spec document.

**Fix (option A):** Remove the 3rd param and have `captureResults` load the
spec's `must_not_touch` list internally.
**Fix (option B):** Keep the param but update the spec to reflect the deliberate
design choice.

---

## Phase 3 — Polish and Consistency

Minor deviations that don't affect correctness but should be cleaned up for
long-term maintainability.

| # | Spec | File | Issue |
|---|------|------|-------|
| 12 | SDD-003 | `src/utils/frontmatter.ts` | Dead `ParseError` interface defined but never used. `parseFrontmatter` return type includes undocumented `parseError?` field. |
| 13 | SDD-005 | `src/specs/validator.ts` | `must_not_touch` is not validated as a required field. |
| 14 | SDD-010 | `src/config/extensionConfig.ts` | `getSpecPrefix()` and `getTestCommand()` are async — callers must `await` simple config accessors. Consider documenting or making synchronous with eager read. |
| 15 | SDD-013 | `src/views/sidebar/specTreeItem.ts` | Status group count is embedded in the label string rather than the VS Code `description` property (grey secondary text). |
| 16 | SDD-014 | `src/extension.ts`, `package.json` | View ID is `sdd.specsTree` but spec says `sdd.specTree`. Both sides agree, so either update spec or rename the ID. |
| 17 | SDD-017 | `src/views/statusBar.ts` | Module-level `activate()` and `dispose()` functions (lines 87–95) are never called — dead code. |
| 18 | SDD-019 | `src/planning/planContextAssembler.ts` | UTF-8 truncation at 50 KB boundary (`Buffer.slice`) can corrupt multi-byte characters at the cut point. Use `Buffer.from(...).subarray(0, N).toString('utf8')` with a safe trim. |
| 19 | SDD-024 | `src/execution/types.ts` | `ExecutionRecord` has an extra `scopeViolation: boolean` field not in the spec. Either add it to the spec or remove it. |
| 20 | SDD-024 | `src/execution/cliRunner.ts` | `ExecutionResult` is defined in `cliRunner.ts` instead of `types.ts`, forcing cross-module imports for a shared type. |

---

## Specs with No Issues

SDD-001, SDD-002, SDD-004, SDD-007, SDD-008, SDD-009, SDD-011, SDD-012,
SDD-016, SDD-018, SDD-023, SDD-025, SDD-027, SDD-029

---

## Remediation Summary

| Phase | Items | Priority |
|-------|-------|----------|
| Phase 1 — Critical Fixes | Issues 1–4 | Fix before any new features |
| Phase 2 — Spec Compliance | Issues 5–11 | Address in next sprint |
| Phase 3 — Polish | Issues 12–20 | Cleanup pass |

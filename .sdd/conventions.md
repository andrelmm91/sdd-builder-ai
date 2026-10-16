# Project Conventions

VS Code extension (TypeScript, esbuild) with Svelte 5 webviews (Vite). Product overview: `README.md`. User workflow: `HOW-TO.md`.

## Lean Rules

- **Wire it or don't write it.** Every new module must be reachable from `src/extension.ts` (a command, provider, panel or activation hook) in the same change. No "building blocks for later". `contextAssembler.ts` sat unused for releases; don't repeat that.
- **One implementation per concept.** Before adding a helper, type or constant, search for an existing one and extend it. Known traps: shell quoting (one module in `src/utils/`), model lists (`BUILTIN_MODELS` in `src/config/aiConfigTypes.ts`), frontmatter read/write (`src/utils/frontmatter.ts`), workspace file I/O (`src/utils/fileSystem.ts`).
- **The extension owns spec status.** Only extension code writes `status:` in a spec's frontmatter, always through `canTransition()` in `src/specs/lifecycle.ts`. Prompts sent to the AI must never ask it to edit frontmatter.
- **No spec markers in code.** Comments like `SDD-042`, `Phase 1:` or `TODO(spec)` don't belong in merged code. Spec IDs may appear only as example data in prompts, templates and tests.
- **Configuration follows code.** Add a `package.json` setting, command or `.sdd/config.json` key in the same change as the first code that reads it, and give every new key a default so existing projects keep working.

## File Structure

```text
src/
  extension.ts            wiring only: register commands, providers, panels
  commands/               one file per command; factory `createXCommand(refresh)` or plain handler
  config/                 *Types.ts (types, defaults, constants) + reader/writer per config file
  execution/              running specs: CLI runner, result capture, bulk queue, gates
  planning/               requirements → spec batches, dependency resolution
  review/                 review decisions and diffs
  specs/                  parser, validator, lifecycle, templates, diagnostics, completions
  utils/                  constants, fileSystem, frontmatter, shell — no VS Code UI calls
  views/sidebar/          tree view
  views/webviews/<name>/  <Name>Panel.ts extends BaseWebviewPanel (singleton, createOrShow)
webview-ui/src/
  <name>/index.ts         mount(Component, { target: document.getElementById('app')! })
  <name>/<Name>.svelte    Svelte 5 runes ($state, $derived) only
  lib/vscode.ts           postMessage / onMessage — the only bridge to the extension
  lib/types.ts            message and data shapes shared across webviews
resources/                templates shipped with the extension (skills, etc.)
test/                     setup.ts (VS Code mock, factories) and fixtures/
```

- Workspace paths are relative to the workspace root and use the constants in `src/utils/constants.ts` (`SPECS_FOLDER`, `CONFIG_FILE`, `EXECUTIONS_FOLDER`, …). Never hard-code `.sdd/...` strings elsewhere.
- Persisted paths (execution records, changed files) use forward slashes on every platform.
- `webview-ui/` cannot import from `src/` (separate bundle). Mirror the shapes it needs in `webview-ui/src/lib/types.ts`, and send data such as model lists from the panel instead of hard-coding it in Svelte.
- Webview messages are camelCase verbs: the webview sends `requestX` / `saveX`, and the panel replies with `xData` / `xSaved` / `xError`.
- Anything that spawns a process or calls git takes an injectable exec function (default `execCommand` from `src/utils/shell.ts`) so it can be tested without the real tool.

## Code Style

- TypeScript strict mode (`tsconfig.json`): no implicit `any`, no unused locals or parameters. Prefix intentionally unused names with `_`.
- 2-space indent, single quotes in `src/`, semicolons, trailing commas in multi-line literals. Match the surrounding file.
- `import type` for type-only imports. Named exports; no default exports in `src/`.
- Prefer pure functions for logic (`parser.ts`, `validator.ts`, `scopeEstimator.ts` are the model). Keep VS Code API calls in commands, panels and providers.
- Use VS Code theme variables (`--vscode-*`) in webview CSS. No hard-coded colors.

## Change Checklists

Update these together in one change.

### New command

1. `src/commands/<name>.ts`
2. `src/extension.ts` (registration)
3. `package.json` `contributes.commands` (title `SDD: …`)

### Spec frontmatter field

1. `src/specs/types.ts` (`SpecData`)
2. `src/specs/parser.ts` and `src/specs/validator.ts` (schema; new fields are optional)
3. `src/specs/completionProvider.ts`
4. `src/specs/templates.ts` and `src/planning/planContextAssembler.ts` when the planner should emit it
5. `resources/skills/sdd-planner/SKILL.md` (field reference table)

### Config key (`.sdd/config.json`)

1. Type and default in `src/config/*Types.ts`
2. Reader merges the default; writer preserves keys it does not own
3. Test that an old config without the key still loads

### Webview message

1. Panel `handleMessage` case
2. Svelte sender/handler
3. `webview-ui/src/lib/types.ts` when the shape is shared

## Testing

- `npm test`, `npm run type-check` and `npm run lint` must pass. Run `npm run build:all` when webviews change. CI runs all four.
- Vitest. Tests sit next to the code as `<file>.test.ts`; shared mocks and factories live in `test/setup.ts` (`createMockSpec`, `createMockDocument`, `createMockExecutionRecord`).
- Mock `vscode` with `vi.mock('vscode', …)` and fake shell/git through the injected exec function. Tests never need a real terminal, git repo, AI CLI or network.
- Cover the failure paths, not only the happy path: cancelled runs, missing files, malformed YAML/JSON, Windows paths (`\`), and `win32` vs POSIX command output.
- Every bug fix adds a regression test that fails before the fix.

## Error Handling

- Pure functions return results, not exceptions: `ParseResult` (`{ success, data | errors }`) and `ValidationResult` (`{ field, message, severity }`). Throw only for infrastructure failures (no workspace, write failed).
- File reads return `undefined` when missing (`readWorkspaceFile`); callers decide whether that's an error.
- Commands catch at the top level and tell the user with `vscode.window.showErrorMessage`, naming the spec and the action (`<specId> execution failed: <reason>`).
- A swallowed error must be intentional and commented, e.g. `catch { /* best-effort: record patch */ }`.
- Never leave a spec in `in_progress` on failure: revert to `ready`, or tell the user exactly what to fix by hand.
- Log diagnostics with a `[SDD]` prefix (`console.warn`) or a panel output channel. Never log prompts that may contain secrets or tokens.
- Anything that reaches a shell (binary names, prompts, titles, paths) must be validated or quoted for the target shell (PowerShell on Windows, bash on POSIX). Never interpolate raw strings.

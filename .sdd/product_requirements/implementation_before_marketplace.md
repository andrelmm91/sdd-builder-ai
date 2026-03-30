Plan to implement                                                                                                                                                │
│                                                                                                                                                                  │
│ VS Code Marketplace Submission Gap Analysis — SDD Platform                                                                                                       │
│                                                                                                                                                                  │
│ Context                                                                                                                                                          │
│                                                                                                                                                                  │
│ The SDD Platform extension (v0.1.0, publisher: andrelmm91) is code-complete with 58 TypeScript source files, 29 test files, built dist/ output, and all core     │
│ features implemented. The goal is to identify and fix everything blocking or degrading a successful VS Code Marketplace submission.                              │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ BLOCKING Gaps (must fix before submission)                                                                                                                       │
│                                                                                                                                                                  │
│ B1 — Command ID mismatch + 5 commands missing from package.json                                                                                                  │
│                                                                                                                                                                  │
│ File: package.json                                                                                                                                               │
│                                                                                                                                                                  │
│ package.json declares sdd.openSddKanban but extension.ts registers sdd.openKanbanBoard — the menu item silently fails on click. Additionally, 5 commands         │
│ registered in extension.ts are completely absent from contributes.commands:                                                                                      │
│                                                                                                                                                                  │
│ ┌──────────────────────────┬─────────────────────────────────────────────┐                                                                                       │
│ │     Missing Command      │                   Purpose                   │                                                                                       │
│ ├──────────────────────────┼─────────────────────────────────────────────┤                                                                                       │
│ │ sdd.addToBulk            │ Add spec to bulk execution queue            │                                                                                       │
│ ├──────────────────────────┼─────────────────────────────────────────────┤                                                                                       │
│ │ sdd.executeAllBulk       │ Execute all queued specs                    │                                                                                       │
│ ├──────────────────────────┼─────────────────────────────────────────────┤                                                                                       │
│ │ sdd.idealizeRequirements │ AI idealization of a feature idea           │                                                                                       │
│ ├──────────────────────────┼─────────────────────────────────────────────┤                                                                                       │
│ │ sdd.createSddCards       │ Generate .sdd.md files from idealization    │                                                                                       │
│ ├──────────────────────────┼─────────────────────────────────────────────┤                                                                                       │
│ │ sdd.openKanbanBoard      │ Open Kanban webview (vs. sdd.openSddKanban) │                                                                                       │
│ └──────────────────────────┴─────────────────────────────────────────────┘                                                                                       │
│                                                                                                                                                                  │
│ Fix: In package.json, rename sdd.openSddKanban → sdd.openKanbanBoard everywhere (commands + menus). Add the 4 other missing commands to contributes.commands.    │
│ Verify all menus reference the corrected IDs.                                                                                                                    │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ B2 — Walkthrough references nonexistent resources/icon.png                                                                                                       │
│                                                                                                                                                                  │
│ File: package.json                                                                                                                                               │
│                                                                                                                                                                  │
│ All 6 walkthrough step images reference "resources/icon.png" which doesn't exist (only resources/icon.svg and media/logo.png exist). Every step shows a broken   │
│ image in the Getting Started experience.                                                                                                                         │
│                                                                                                                                                                  │
│ Fix: Change all 6 walkthrough media.image paths from "resources/icon.png" to "media/logo.png" as a quick fix, or ideally create per-step screenshots.            │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ B3 — @vscode/vsce missing, no package/publish scripts                                                                                                            │
│                                                                                                                                                                  │
│ File: package.json                                                                                                                                               │
│                                                                                                                                                                  │
│ Cannot package or publish without the tooling. No package or publish scripts exist.                                                                              │
│                                                                                                                                                                  │
│ Fix:                                                                                                                                                             │
│ - Add "@vscode/vsce": "^3.x" to devDependencies                                                                                                                  │
│ - Add scripts:                                                                                                                                                   │
│ "package": "npm run build:all && vsce package",                                                                                                                  │
│ "publish": "npm run build:all && vsce publish"                                                                                                                   │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ B4 — package.json display name doesn't match "Builder AI" branding + README has placeholder URLs                                                                 │
│                                                                                                                                                                  │
│ Clarification: The user confirmed "Builder AI" is the correct product name. The README already uses this name correctly. The fixes are:                          │
│                                                                                                                                                                  │
│ package.json:                                                                                                                                                    │
│ - Line 3: "displayName": "SDD Platform" → "Builder AI"                                                                                                           │
│ - Line 157: "title": "SDD Platform" (viewsContainers) → "Builder AI"                                                                                             │
│ - Line 172: "title": "SDD Platform" (configuration) → "Builder AI"                                                                                               │
│                                                                                                                                                                  │
│ README.md:                                                                                                                                                       │
│ - Line 140: ext install builder-ai → ext install andrelmm91.sdd-platform                                                                                         │
│ - Line 151: Change HOW-TO.md relative link to full GitHub URL: https://github.com/andrelmm91/sdd-agentic/blob/main/HOW-TO.md                                     │
│ - Line 178: Fix placeholder Issues URL https://github.com/your-org/builder-ai/issues → https://github.com/andrelmm91/sdd-agentic/issues                          │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ B5 — CHANGELOG has [Unreleased] block before shipping 0.1.0                                                                                                      │
│                                                                                                                                                                  │
│ File: CHANGELOG.md                                                                                                                                               │
│                                                                                                                                                                  │
│ The [Unreleased] section contains the sdd.createSddCards feature. Marketplace displays the CHANGELOG, and an [Unreleased] block at the top suggests incomplete   │
│ features.                                                                                                                                                        │
│                                                                                                                                                                  │
│ Fix: Either move [Unreleased] items into [0.1.0] (if the feature is complete), or remove the [Unreleased] section and also remove the command from extension.ts  │
│ and package.json if not ready to ship.                                                                                                                           │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ IMPORTANT Gaps (strongly recommended)                                                                                                                            │
│                                                                                                                                                                  │
│ I1 — No CI/CD pipeline                                                                                                                                           │
│                                                                                                                                                                  │
│ Files to create: .github/workflows/ci.yml, .github/workflows/publish.yml                                                                                         │
│                                                                                                                                                                  │
│ No automated testing or publishing. Manual process risks shipping broken builds since dist/ is gitignored.                                                       │
│                                                                                                                                                                  │
│ Fix:                                                                                                                                                             │
│ - ci.yml: Trigger on push/PR to main — run npm ci, npm run type-check, npm test, npm run build:all                                                               │
│ - publish.yml: Trigger on v* tags — build + vsce publish using VSCE_PAT secret                                                                                   │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ I2 — No screenshots in README                                                                                                                                    │
│                                                                                                                                                                  │
│ Files: README.md, create media/screenshots/                                                                                                                      │
│                                                                                                                                                                  │
│ The marketplace listing shows no visual preview. Zero images = low install conversion rate.                                                                      │
│                                                                                                                                                                  │
│ Fix: Add a ## Screenshots section with at minimum:                                                                                                               │
│ 1. Kanban board with spec cards                                                                                                                                  │
│ 2. Requirement Board (3-column pipeline)                                                                                                                         │
│ 3. Terminal showing Claude CLI execution                                                                                                                         │
│ 4. Review diff split view                                                                                                                                        │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ I3 — Logo PNG is likely a placeholder (567 bytes for 128x128)                                                                                                    │
│                                                                                                                                                                  │
│ File: media/logo.png                                                                                                                                             │
│                                                                                                                                                                  │
│ A 128x128 color PNG at 567 bytes is nearly blank. This is the icon shown in marketplace search results.                                                          │
│                                                                                                                                                                  │
│ Fix: Replace media/logo.png with a proper 128x128 (or 256x256) designed icon.                                                                                    │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ I4 — Windows incompatibility in core execution path                                                                                                              │
│                                                                                                                                                                  │
│ Files: src/execution/cliRunner.ts, src/execution/processSpawner.ts, src/utils/shell.ts                                                                           │
│                                                                                                                                                                  │
│ Bash-specific constructs that fail silently on Windows:                                                                                                          │
│ - Sentinel wrapping: { cmd; echo $? > /tmp/sentinel; } 2>&1 | tee logfile — /tmp/ doesn't exist on Windows                                                       │
│ - isCommandAvailable falls back to /bin/zsh on non-Windows (fails on Linux servers without zsh)                                                                  │
│ - Login shell detection falls back to /bin/zsh                                                                                                                   │
│                                                                                                                                                                  │
│ Minimum fix: Add early Windows detection in CliRunner.execute() showing a clear error: "Execution not yet supported on Windows." This is better than a cryptic   │
│ failure. Also change the zsh fallback to /bin/sh for Linux compatibility.                                                                                        │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ I5 — Publisher account must be verified (process, not code)                                                                                                      │
│                                                                                                                                                                  │
│ The publisher andrelmm91 must have a verified marketplace account at marketplace.visualstudio.com with a PAT (Marketplace Manage scope) for vsce publish to      │
│ succeed. No code fix — human action required.                                                                                                                    │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ NICE-TO-HAVE                                                                                                                                                     │
│                                                                                                                                                                  │
│ N1 — Categories weak ("Other" only)                                                                                                                              │
│                                                                                                                                                                  │
│ File: package.json                                                                                                                                               │
│                                                                                                                                                                  │
│ Fix: Change categories to ["AI", "Other"] — better marketplace discoverability.                                                                    │
│                                                                                                                                                                  │
│ N2 — Walkthrough step images all identical                                                                                                                       │
│                                                                                                                                                                  │
│ File: package.json, media/                                                                                                                                       │
│                                                                                                                                                                  │
│ Each step should have a unique screenshot. Low priority but improves onboarding UX.                                                                              │
│                                                                                                                                                                  │
│ N3 — CHANGELOG missing blank line between [Unreleased] and [0.1.0]                                                                                               │
│                                                                                                                                                                  │
│ File: CHANGELOG.md                                                                                                                                               │
│                                                                                                                                                                  │
│ Minor formatting issue. Add blank line between sections.                                                                                                         │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ Priority Order for Implementation                                                                                                                                │
│                                                                                                                                                                  │
│ 1. B4 — README name/URL fixes (easiest, highest visibility impact)                                                                                               │
│ 2. B1 — Command ID mismatch + missing commands in package.json                                                                                                   │
│ 3. B2 — Walkthrough broken image fix                                                                                                                             │
│ 4. B3 — Install vsce, add scripts                                                                                                                                │
│ 5. B5 — Resolve CHANGELOG [Unreleased] block                                                                                                                     │
│ 6. I3 — Replace logo PNG                                                                                                                                         │
│ 7. I2 — Add screenshots to README                                                                                                                                │
│ 8. I4 — Windows guard clause in cliRunner                                                                                                                        │
│ 9. I1 — CI/CD workflows                                                                                                                                          │
│ 10. N1, N2, N3 — Polish                                                                                                                                          │
│                                                                                                                                                                  │
│ ---                                                                                                                                                              │
│ Verification                                                                                                                                                     │
│                                                                                                                                                                  │
│ After all blocking fixes:                                                                                                                                        │
│ npm install                # picks up @vscode/vsce                                                                                                               │
│ npm run type-check         # no TypeScript errors                                                                                                                │
│ npm test                   # all unit tests pass                                                                                                                 │
│ npm run package            # builds all + produces .vsix                                                                                                         │
│ code --install-extension sdd-platform-0.1.0.vsix   # install locally                                                                                             │
│ # Verify: Command Palette shows all 17+ commands                                                                                                                 │
│ # Verify: Getting Started walkthrough shows all images                                                                                                           │
│ # Verify: Kanban board opens correctly                                                                                                                           │
│ vsce publish               # publish to marketplace 
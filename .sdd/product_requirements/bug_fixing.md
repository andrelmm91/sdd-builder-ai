Fix CLI Runner: Copilot Ask Mode + Claude Completion Detection                                                                   
                                                        
 Context

 Testing revealed 3 of 4 execution modes are broken:
 - Copilot yolo: WORKS
 - Copilot ask: command + prompt both fire before shell is ready; prompt sent as shell input (not to gh copilot), causing the
 command to appear twice
 - Claude full permission: Claude stays in REPL (no auto-exit), echo $? sentinel never runs
 - Claude ask/plan: same REPL issue + interactive mode needs different completion detection

 Fix 1: Claude dangerously-skip-permissions — Add -p flag

 File: src/execution/cliRunner.ts (lines 269-279)

 Claude CLI with a positional prompt argument enters REPL mode (doesn't auto-exit). Adding -p (print mode) makes it one-shot:
 execute and exit, so echo $? > sentinel runs.

 if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
   parts.push('-p', '--dangerously-skip-permissions');
 }
 parts.push(sq(prompt));
 return { command: parts.join(' ') };

 Fix 2: Copilot ask mode — Delay terminal creation → command → prompt

 File: src/execution/cliRunner.ts (lines 83-98)

 Actual terminal output confirmed: both sendText calls fire before the shell is initialized. The prompt text gets consumed by the
  shell (not gh copilot), causing the command to re-execute.

 Fix: Add delays at two points:
 1. After terminal.show() — wait ~1s for shell to initialize before sending command
 2. Before terminalInput — wait ~2s for gh copilot to start and be ready for stdin

 terminal.show();

 // Wait for shell to initialize before sending any text
 await new Promise(resolve => setTimeout(resolve, 1000));
 terminal.sendText(wrappedCommand);

 if (terminalInput !== undefined) {
   // Wait for the CLI process to start and be ready to read stdin
   await new Promise(resolve => setTimeout(resolve, 2000));
   terminal.sendText(terminalInput);
 }

 Note: The 1s delay after terminal.show() also fixes the potential "sent twice" issue for Claude modes.

 Fix 3: Claude ask/plan modes — Interactive completion via terminal close

 File: src/execution/cliRunner.ts

 These modes are interactive (user approves/denies tools). Claude stays in REPL after task completion. The sentinel approach
 won't work. Changes:

 1. _buildCommand returns interactive?: boolean for Claude default/plan modes
 2. Skip sentinel wrapping for interactive commands:
 const wrappedCommand = interactive ? command : `${command}; echo $? > ${sq(sentinel)}`;
 3. _waitForCompletion — when interactive is true, skip sentinel polling, only listen for terminal close event + timeout
 4. Show info message after terminal launch: "Close the terminal when the task is complete"

 Test Updates

 File: src/execution/cliRunner.test.ts

 Add tests that let execution proceed to terminal creation (mock fs.access for sentinel):
 - Claude dangerously-skip-permissions: verify sendText includes -p flag
 - Claude default/plan: verify command does NOT include sentinel suffix
 - Copilot ask: verify terminalInput sent after delay (fake timers)

 Files to Modify

 - src/execution/cliRunner.ts — all 3 fixes
 - src/execution/cliRunner.test.ts — new test cases

 Verification

 1. Run npm test to confirm existing + new tests pass
 2. Manual test all 4 modes:
   - Copilot yolo: should still work (regression check)
   - Copilot ask: gh copilot starts, prompt appears after delay, interactive
   - Claude full permission: runs with -p, auto-exits, status transitions to review
   - Claude ask/plan: interactive, user closes terminal when done, status transitions to review
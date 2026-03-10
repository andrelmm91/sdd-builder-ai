import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXECUTIONS_FOLDER } from '../utils/constants';

export interface SpawnResult {
  success: boolean;
  error?: string;
}

export interface RunInTerminalOptions {
  command: string;
  terminalName: string;
  cwd: string;
  timeoutMs: number;
  /** When set, stdout+stderr are captured via tee into .sdd/executions/<logName>/exec-<ts>.log */
  logName?: string;
  onSuccess?: () => Promise<void>;
  onFailure?: (exitCode: number | void) => void;
}

/**
 * Spawns a shell command with timeout and VS Code cancellation token support.
 * Uses a settle-once pattern to ensure the promise resolves exactly once.
 * Runs via the user's login shell so the full PATH (nvm, homebrew, etc.) is available.
 */
export function spawnWithCancellation(
  command: string,
  cwd: string,
  token: vscode.CancellationToken,
  timeoutMs: number,
): Promise<SpawnResult> {
  const loginShell = process.env.SHELL || '/bin/zsh';
  return new Promise((resolve) => {
    const child = cp.spawn(loginShell, ['-l', '-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;

    const settle = (result: SpawnResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      settle({ success: false, error: 'Timed out after 10 minutes' });
    }, timeoutMs);

    token.onCancellationRequested(() => {
      child.kill('SIGTERM');
      clearTimeout(timeout);
      settle({ success: false, error: 'Cancelled by user' });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      settle(code === 0 ? { success: true } : { success: false, error: `Process exited with code ${code}` });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      settle({ success: false, error: err.message });
    });
  });
}

/** Wraps a string in single quotes, escaping any internal single quotes. */
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Opens a real interactive VS Code terminal and runs a command in it — exactly as if the user
 * typed the command themselves. This gives the AI CLI a proper PTY so interactive modes
 * (plan, ask) work correctly and streaming output appears in real time.
 *
 * Completion is detected via a sentinel file so onSuccess/onFailure callbacks still fire.
 */
export async function runInTerminal(options: RunInTerminalOptions): Promise<void> {
  const { command, terminalName, cwd, timeoutMs, logName, onSuccess, onFailure } = options;

  // Use the real tmpdir path (macOS: /tmp → /private/tmp symlink)
  const tmpDir = (() => { try { return fs.realpathSync(os.tmpdir()); } catch { return os.tmpdir(); } })();
  const sentinelName = `sdd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.done`;
  const sentinelPath = path.join(tmpDir, sentinelName);

  // When a logName is given, persist output to .sdd/executions/<logName>/exec-<ts>.log
  // via `tee` so the user still sees live output in the terminal.
  let persistentLogPath: string | null = null;
  let commandToRun = command;
  if (logName) {
    const ts = Date.now();
    const logDir = path.join(cwd, EXECUTIONS_FOLDER, logName);
    fs.mkdirSync(logDir, { recursive: true });
    persistentLogPath = path.join(logDir, `exec-${ts}.log`);
    commandToRun = `set -o pipefail; ${command} 2>&1 | tee ${sq(persistentLogPath)}`;
  }

  const terminal = vscode.window.createTerminal({ name: terminalName, cwd });
  terminal.show();

  // Delay sendText to avoid double-echo: if text is sent before the shell finishes
  // initialising, the PTY echoes it once (pre-prompt) and then the shell echoes it
  // again after the prompt appears. Waiting ~150 ms lets the shell render its first
  // prompt before we send the command, so only one echo is visible.
  await new Promise<void>((r) => setTimeout(r, 150));

  // Send as a single line — exactly as if the user pasted it into the terminal.
  // The command and sentinel echo are joined with '; ' so only one line appears.
  // Newlines in the command are already normalised to spaces by buildCliCommand /
  // cliRunner._buildCommand, so no `quote>` continuation prompt appears.
  terminal.sendText(`${commandToRun}; echo $? > ${sq(sentinelPath)}`);

  return new Promise<void>((resolve) => {
    let settled = false;
    let watcher: fs.FSWatcher | null = null;

    const done = async (exitCode: number | void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watcher?.close();
      try { fs.unlinkSync(sentinelPath); } catch { /* best-effort */ }
      if (exitCode === 0) {
        await onSuccess?.();
      } else {
        onFailure?.(exitCode);
      }
      resolve();
    };

    const timer = setTimeout(() => void done(undefined), timeoutMs);

    watcher = fs.watch(tmpDir, (_event, filename) => {
      if (filename !== sentinelName || settled) return;
      // Small delay to ensure the file write is flushed before we read it
      setTimeout(() => {
        try {
          const content = fs.readFileSync(sentinelPath, 'utf8').trim();
          const code = parseInt(content, 10);
          void done(isNaN(code) ? 1 : code);
        } catch {
          void done(1);
        }
      }, 100);
    });
  });
}

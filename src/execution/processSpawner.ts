import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface SpawnResult {
  success: boolean;
  error?: string;
}

export interface RunInTerminalOptions {
  command: string;
  terminalName: string;
  cwd: string;
  timeoutMs: number;
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

/**
 * Runs a command in a VS Code PTY terminal using the user's login shell.
 * Streams stdout/stderr to the terminal and calls onSuccess/onFailure on exit.
 */
export function runInTerminal(options: RunInTerminalOptions): Promise<void> {
  const { command, terminalName, cwd, timeoutMs, onSuccess, onFailure } = options;
  const loginShell = process.env.SHELL || '/bin/zsh';

  return new Promise<void>((resolve) => {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number | void>();
    let child: cp.ChildProcess | null = null;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,
      open: () => {
        child = cp.spawn(loginShell, ['-l', '-c', command], {
          cwd,
          // Ignore stdin so AI CLIs don't hang waiting for an open pipe to close
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const timeout = setTimeout(() => {
          child?.kill('SIGTERM');
          writeEmitter.fire('\r\n[SDD] Process timed out.\r\n');
          closeEmitter.fire(1);
        }, timeoutMs);

        const onData = (chunk: Buffer | string) => {
          writeEmitter.fire(chunk.toString().replace(/\n/g, '\r\n'));
        };

        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);

        child.on('close', (code) => {
          clearTimeout(timeout);
          child = null;
          writeEmitter.fire(`\r\n[SDD] Process exited with code ${code}.\r\n`);
          closeEmitter.fire(code ?? 1);
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          child = null;
          writeEmitter.fire(`\r\n[SDD] Error: ${err.message}\r\n`);
          closeEmitter.fire(1);
        });
      },
      close: () => {
        // User closed the terminal — kill the process
        child?.kill('SIGTERM');
        child = null;
      },
    };

    const terminal = vscode.window.createTerminal({ name: terminalName, pty });
    terminal.show();

    closeEmitter.event(async (exitCode) => {
      // Do NOT dispose the terminal — keep it visible so the user can read output
      writeEmitter.dispose();
      closeEmitter.dispose();
      if (exitCode === 0) {
        await onSuccess?.();
      } else {
        onFailure?.(exitCode);
      }
      resolve();
    });
  });
}

import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface SpawnResult {
  success: boolean;
  error?: string;
}

/**
 * Spawns a shell command with timeout and VS Code cancellation token support.
 * Uses a settle-once pattern to ensure the promise resolves exactly once.
 */
export function spawnWithCancellation(
  command: string,
  cwd: string,
  token: vscode.CancellationToken,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = cp.spawn(command, [], { shell: true, cwd });
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

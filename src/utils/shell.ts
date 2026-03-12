import { exec } from 'child_process';
import * as os from 'os';

export type ExecOptions = {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB
const DEFAULT_TIMEOUT_MS = 60_000;

export function execCommand(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const timeout = (options.timeout ?? DEFAULT_TIMEOUT_MS);
    const env = options.env ? { ...process.env, ...options.env } : process.env;

    const child = exec(
      command,
      {
        cwd: options.cwd,
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES,
        env,
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code != null ? (typeof error.code === 'number' ? error.code : 1) : 0;

        // timeout produces ETIMEDOUT / killed
        if (error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          resolve({
            stdout: stdout ?? '',
            stderr: `Command timed out after ${timeout}ms`,
            exitCode: 124,
            success: false,
          });
          return;
        }

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode,
          success: exitCode === 0,
        });
      }
    );

    // child is only null when exec throws synchronously (very rare)
    if (!child) {
      resolve({ stdout: '', stderr: 'Failed to spawn process', exitCode: 1, success: false });
    }
  });
}

export async function isCommandAvailable(command: string): Promise<boolean> {
  let checker: string;
  if (os.platform() === 'win32') {
    checker = `where ${command}`;
  } else {
    // Run through the user's login shell so PATH includes nvm, homebrew, etc.
    const userShell = process.env.SHELL || '/bin/sh';
    checker = `${userShell} -l -c 'which ${command}'`;
  }
  const result = await execCommand(checker);
  return result.success;
}

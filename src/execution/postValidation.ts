import { execCommand, isCommandAvailable } from '../utils/shell';
import type { ExecutionConfig } from './types';

export type ValidationResult = {
  passed: boolean;
  output: string;
  duration: number;
  command: string;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function runPostValidation(config: ExecutionConfig, cwd?: string): Promise<ValidationResult> {
  const command = config.testCommand;
  const startTime = Date.now();

  const baseCommand = command.trim().split(/\s+/)[0];
  const available = await isCommandAvailable(baseCommand);
  if (!available) {
    return {
      passed: false,
      output: `Command not found: "${baseCommand}"`,
      duration: Date.now() - startTime,
      command,
    };
  }

  const result = await execCommand(command, {
    cwd: cwd ?? process.cwd(),
    timeout: DEFAULT_TIMEOUT_MS,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const duration = Date.now() - startTime;

  if (!result.success && result.exitCode === 124) {
    return {
      passed: false,
      output: `Timeout: test command did not complete within ${DEFAULT_TIMEOUT_MS / 1000}s`,
      duration,
      command,
    };
  }

  return {
    passed: result.success,
    output,
    duration,
    command,
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionConfig } from './types';

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
  isCommandAvailable: vi.fn(),
}));

import { runPostValidation } from './postValidation';
import { execCommand, isCommandAvailable } from '../utils/shell';

const mockExecCommand = vi.mocked(execCommand);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);

function makeConfig(overrides: Partial<ExecutionConfig> = {}): ExecutionConfig {
  return {
    maxTokens: 100000,
    claudeCliBinary: 'claude',
    testCommand: 'npm test',
    autoValidate: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCommandAvailable.mockResolvedValue(true);
  mockExecCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, success: true });
});

describe('runPostValidation', () => {
  it('returns passed=true when test command exits with code 0', async () => {
    mockExecCommand.mockResolvedValue({ stdout: 'All tests passed', stderr: '', exitCode: 0, success: true });

    const result = await runPostValidation(makeConfig());

    expect(result.passed).toBe(true);
    expect(result.output).toBe('All tests passed');
    expect(result.command).toBe('npm test');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns passed=false with captured output when test command fails', async () => {
    mockExecCommand.mockResolvedValue({
      stdout: '5 tests failed',
      stderr: 'Error: assertion failed',
      exitCode: 1,
      success: false,
    });

    const result = await runPostValidation(makeConfig());

    expect(result.passed).toBe(false);
    expect(result.output).toContain('5 tests failed');
    expect(result.output).toContain('assertion failed');
    expect(result.command).toBe('npm test');
  });

  it('returns passed=false with "Command not found" when base command is unavailable', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    const result = await runPostValidation(makeConfig({ testCommand: 'missing-cmd --flag' }));

    expect(result.passed).toBe(false);
    expect(result.output).toMatch(/Command not found.*missing-cmd/);
    expect(mockExecCommand).not.toHaveBeenCalled();
  });

  it('returns passed=false with "Timeout" message when exit code is 124', async () => {
    mockExecCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Command timed out after 300000ms',
      exitCode: 124,
      success: false,
    });

    const result = await runPostValidation(makeConfig());

    expect(result.passed).toBe(false);
    expect(result.output).toMatch(/Timeout/i);
    expect(result.command).toBe('npm test');
  });

  it('passes the configured cwd to execCommand', async () => {
    await runPostValidation(makeConfig(), '/my/workspace');

    expect(mockExecCommand).toHaveBeenCalledWith(
      'npm test',
      expect.objectContaining({ cwd: '/my/workspace' }),
    );
  });

  it('includes timing data in the result', async () => {
    const result = await runPostValidation(makeConfig());

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

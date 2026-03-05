import { describe, it, expect } from 'vitest';
import { execCommand, isCommandAvailable } from './shell';

describe('execCommand', () => {
  it('returns stdout and exitCode 0 for a successful command', async () => {
    const result = await execCommand('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns stderr and non-zero exitCode for a failing command', async () => {
    const result = await execCommand('node -e "process.exit(1)"');
    expect(result.exitCode).toBe(1);
    expect(result.success).toBe(false);
  });

  it('handles timeout and returns an appropriate error', async () => {
    const result = await execCommand('node -e "setTimeout(()=>{},5000)"', { timeout: 200 });
    expect(result.success).toBe(false);
    expect(result.stderr).toMatch(/timed out/i);
    expect(result.exitCode).toBe(124);
  }, 5000);
});

describe('isCommandAvailable', () => {
  it('returns true for git', async () => {
    const available = await isCommandAvailable('git');
    expect(available).toBe(true);
  });

  it('returns false for a nonexistent command', async () => {
    const available = await isCommandAvailable('__nonexistent_cmd_xyz__');
    expect(available).toBe(false);
  });
});

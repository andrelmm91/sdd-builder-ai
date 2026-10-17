import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, exec: vi.fn(actual.exec) };
});

import { exec } from 'child_process';
import { quoteBash } from './shellQuote';
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
  beforeEach(() => {
    vi.mocked(exec).mockClear();
  });

  it('returns true for git', async () => {
    const available = await isCommandAvailable('git');
    expect(available).toBe(true);
  });

  it('returns false for a nonexistent command', async () => {
    const available = await isCommandAvailable('__nonexistent_cmd_xyz__');
    expect(available).toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['semicolon', "git; echo pwned"],
    ['single quote', "'; echo pwned; '"],
    ['&&', 'git && echo pwned'],
    ['&', 'git & echo pwned'],
    ['pipe', 'git | cat'],
    ['backtick', 'git`id`'],
    ['$()', 'git$(id)'],
    ['double quote', 'git"'],
    ['newline', 'git\necho pwned'],
  ])('rejects %s without spawning a process', async (_label, cmd) => {
    expect(await isCommandAvailable(cmd)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('accepts an absolute path with spaces and quotes it before spawning', async () => {
    const winPath = 'C:\\Program Files\\Git\\cmd\\git.exe';
    const path = process.platform === 'win32' ? winPath : '/opt/my tools/bin/git';
    await isCommandAvailable(path);
    expect(exec).toHaveBeenCalledTimes(1);
    const checker = vi.mocked(exec).mock.calls[0][0] as string;
    expect(checker).toContain(path);
    if (process.platform === 'win32') {
      expect(checker).toBe(`where "${path}"`);
    } else {
      expect(checker).toContain(quoteBash(path));
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCheckpoint, getChangesSince } from './gitCheckpoint';
import type { ExecFn } from './gitCheckpoint';
import type { GitCheckpoint } from './types';

const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, success: true });
const fail = () => ({ stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, success: false });

function mockExec(responses: Record<string, string>) {
  return vi.fn(async (cmd: string) => {
    for (const [key, out] of Object.entries(responses)) {
      if (cmd.includes(key)) { return ok(out); }
    }
    return ok('');
  }) as unknown as ExecFn & ReturnType<typeof vi.fn>;
}

const cp: GitCheckpoint = {
  headSha: 'head1',
  baseSha: 'base1',
  untrackedBefore: ['old-untracked.txt'],
  createdAt: '2026-10-16T00:00:00.000Z',
};

describe('createCheckpoint', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('uses HEAD as baseSha on a clean tree', async () => {
    const exec = mockExec({ 'rev-parse': 'abc123\n', 'stash create': '', 'ls-files': 'a.txt\n' });
    const result = await createCheckpoint('/repo', exec);
    expect(result?.headSha).toBe('abc123');
    expect(result?.baseSha).toBe('abc123');
    expect(result?.untrackedBefore).toEqual(['a.txt']);
    expect(new Date(result!.createdAt).toISOString()).toBe(result!.createdAt);
  });

  it('uses the stash sha as baseSha on a dirty tree', async () => {
    const exec = mockExec({ 'rev-parse': 'abc123\n', 'stash create': 'stash999\n' });
    const result = await createCheckpoint('/repo', exec);
    expect(result?.headSha).toBe('abc123');
    expect(result?.baseSha).toBe('stash999');
  });

  it('returns undefined and warns when not a git repository', async () => {
    const exec = vi.fn(async () => fail());
    expect(await createCheckpoint('/nope', exec)).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('never runs mutating git commands and stays within 4 commands', async () => {
    const exec = mockExec({ 'rev-parse': 'abc\n' });
    await createCheckpoint('/repo', exec);
    const cmds = exec.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(cmds.length).toBeLessThanOrEqual(4);
    expect(cmds.join('\n')).not.toMatch(/stash push|reset|checkout|commit|add /);
  });
});

describe('getChangesSince', () => {
  it('reports new untracked files as A', async () => {
    const exec = mockExec({ 'diff': '', 'ls-files': 'new.ts\n' });
    expect(await getChangesSince(cp, '/repo', exec)).toEqual(['A new.ts']);
  });

  it('does not report pre-existing untracked files', async () => {
    const exec = mockExec({ 'diff': '', 'ls-files': 'old-untracked.txt\nnew.ts\n' });
    expect(await getChangesSince(cp, '/repo', exec)).toEqual(['A new.ts']);
  });

  it('reports tracked changes, including AI commits (diff against baseSha)', async () => {
    const exec = mockExec({ 'diff': 'M\tsrc/a.ts\nD\tsrc/b.ts\nA\tsrc/c.ts\n', 'ls-files': '' });
    const result = await getChangesSince(cp, '/repo', exec);
    expect(result).toEqual(['M src/a.ts', 'D src/b.ts', 'A src/c.ts']);
    expect(exec.mock.calls[0][0]).toContain('base1');
  });

  it('reports renames as R with the new path', async () => {
    const exec = mockExec({ 'diff': 'R100\told.ts\tnew.ts\n', 'ls-files': '' });
    expect(await getChangesSince(cp, '/repo', exec)).toEqual(['R new.ts']);
  });

  it('normalizes Windows backslashes and removes duplicates', async () => {
    const exec = mockExec({ 'diff': 'M\tsrc\\a.ts\n', 'ls-files': 'src\\a.ts\nsrc\\dir\\n.ts\n' });
    expect(await getChangesSince(cp, '/repo', exec)).toEqual(['M src/a.ts', 'A src/dir/n.ts']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCheckpoint, getChangesSince, restoreCheckpoint } from './gitCheckpoint';
import type { ExecFn } from './gitCheckpoint';
import type { GitCheckpoint } from './types';

const rmMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('fs/promises', () => ({ rm: rmMock }));

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

describe('restoreCheckpoint', () => {
  const cmdsOf = (exec: ReturnType<typeof vi.fn>) => exec.mock.calls.map((c) => c[0] as string);

  function restoreExec(opts: { head?: string; existing?: string[]; failOn?: string; diff?: string } = {}) {
    return vi.fn(async (cmd: string) => {
      if (cmd.startsWith('git rev-parse HEAD')) { return ok(`${opts.head ?? 'head1'}\n`); }
      if (cmd.includes('diff --name-status')) { return ok(opts.diff ?? ''); }
      if (cmd.includes('cat-file -e')) {
        return (opts.existing ?? []).some((f) => cmd.includes(f)) ? ok('') : fail();
      }
      if (opts.failOn && cmd.includes(opts.failOn) && cmd.includes('checkout')) { return fail(); }
      return ok('');
    }) as unknown as ExecFn & ReturnType<typeof vi.fn>;
  }

  beforeEach(() => { rmMock.mockClear(); });

  it('restores M and D files from baseSha and unstages them', async () => {
    const exec = restoreExec();
    const res = await restoreCheckpoint(cp, ['M src/a.ts', 'D src/b.ts'], '/repo', exec);
    expect(res.restored).toEqual(['src/a.ts', 'src/b.ts']);
    const cmds = cmdsOf(exec);
    expect(cmds.some((c) => c.includes('checkout base1 --') && c.includes('src/a.ts'))).toBe(true);
    expect(cmds.some((c) => c.includes('reset -q --') && c.includes('src/b.ts'))).toBe(true);
    expect(rmMock).not.toHaveBeenCalled();
  });

  it('deletes an A file that did not exist at base', async () => {
    const res = await restoreCheckpoint(cp, ['A new.ts'], '/repo', restoreExec());
    expect(res.deleted).toEqual(['new.ts']);
    expect(rmMock).toHaveBeenCalledTimes(1);
  });

  it('restores an A file that existed at base', async () => {
    const res = await restoreCheckpoint(cp, ['A kept.ts'], '/repo', restoreExec({ existing: ['kept.ts'] }));
    expect(res.restored).toEqual(['kept.ts']);
    expect(res.deleted).toEqual([]);
    expect(rmMock).not.toHaveBeenCalled();
  });

  it('restores the old path and deletes the new path for R', async () => {
    const res = await restoreCheckpoint(cp, ['R new.ts'], '/repo', restoreExec({ diff: 'R100\told.ts\tnew.ts\n' }));
    expect(res.restored).toEqual(['old.ts']);
    expect(res.deleted).toEqual(['new.ts']);
    expect(rmMock).toHaveBeenCalledTimes(1);
  });

  it('records a per-file failure in skipped and continues', async () => {
    const res = await restoreCheckpoint(cp, ['M bad.ts', 'M good.ts'], '/repo', restoreExec({ failOn: 'bad.ts' }));
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].path).toBe('bad.ts');
    expect(res.restored).toEqual(['good.ts']);
  });

  it('detects headMoved', async () => {
    expect((await restoreCheckpoint(cp, [], '/repo', restoreExec({ head: 'head2' }))).headMoved).toBe(true);
    expect((await restoreCheckpoint(cp, [], '/repo', restoreExec())).headMoved).toBe(false);
  });

  it('never issues destructive git commands', async () => {
    const exec = restoreExec({ diff: 'R100\told.ts\tnew.ts\n', head: 'head2' });
    await restoreCheckpoint(cp, ['M a.ts', 'D b.ts', 'A c.ts', 'R new.ts'], '/repo', exec);
    for (const c of cmdsOf(exec)) {
      expect(c).not.toMatch(/reset --hard|clean|stash pop/);
    }
  });
});

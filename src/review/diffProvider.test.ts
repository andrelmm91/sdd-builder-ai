import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({
      fsPath: p,
      with: (opts: Record<string, unknown>) => ({ ...opts, fsPath: p }),
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
}));

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
}));

import * as path from 'path';
import * as vscode from 'vscode';
import { DiffProvider } from './diffProvider';
import { execCommand } from '../utils/shell';
import { getWorkspaceRoot } from '../utils/fileSystem';

const mockExecCommand = vi.mocked(execCommand);

beforeEach(() => {
  vi.clearAllMocks();
  mockExecCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, success: true });
});

// ---------------------------------------------------------------------------
// getChangedFiles — parsing git diff --name-status output
// ---------------------------------------------------------------------------

describe('DiffProvider.getChangedFiles', () => {
  it('parses modified, added, and deleted files from git output', async () => {
    mockExecCommand.mockResolvedValueOnce({
      stdout: 'M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\tsrc/baz.ts\n',
      stderr: '',
      exitCode: 0,
      success: true,
    });

    const provider = new DiffProvider();
    const files = await provider.getChangedFiles();

    expect(files).toEqual([
      { path: 'src/foo.ts', status: 'modified' },
      { path: 'src/bar.ts', status: 'added' },
      { path: 'src/baz.ts', status: 'deleted' },
    ]);
  });

  it('returns empty array when git diff has no output', async () => {
    mockExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      success: true,
    });

    const provider = new DiffProvider();
    const files = await provider.getChangedFiles();

    expect(files).toEqual([]);
  });

  it('returns empty array when git command fails', async () => {
    mockExecCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'not a git repo',
      exitCode: 128,
      success: false,
    });

    const provider = new DiffProvider();
    const files = await provider.getChangedFiles();

    expect(files).toEqual([]);
  });

  it('maps rename status (R) to modified', async () => {
    mockExecCommand.mockResolvedValueOnce({
      stdout: 'R100\told/path.ts\tnew/path.ts\n',
      stderr: '',
      exitCode: 0,
      success: true,
    });

    const provider = new DiffProvider();
    const files = await provider.getChangedFiles();

    // Rename: last tab-separated segment is the new path
    expect(files[0].status).toBe('modified');
    expect(files[0].path).toBe('new/path.ts');
  });
});

// ---------------------------------------------------------------------------
// getScopeViolations
// ---------------------------------------------------------------------------

describe('DiffProvider.getScopeViolations', () => {
  function setupChangedFiles(lines: string) {
    mockExecCommand.mockResolvedValueOnce({
      stdout: lines,
      stderr: '',
      exitCode: 0,
      success: true,
    });
  }

  it('returns files not listed in relevant_files', async () => {
    setupChangedFiles('M\tsrc/foo.ts\nM\tsrc/unexpected.ts\n');

    const provider = new DiffProvider();
    const violations = await provider.getScopeViolations(['src/foo.ts'], []);

    expect(violations).toEqual([{ path: 'src/unexpected.ts', status: 'modified' }]);
  });

  it('returns files listed in must_not_touch even if also in relevant_files', async () => {
    setupChangedFiles('M\tsrc/protected.ts\nM\tsrc/ok.ts\n');

    const provider = new DiffProvider();
    const violations = await provider.getScopeViolations(
      ['src/protected.ts', 'src/ok.ts'],
      ['src/protected.ts']
    );

    expect(violations).toEqual([{ path: 'src/protected.ts', status: 'modified' }]);
  });

  it('returns empty array when all changed files are in relevant_files and not in must_not_touch', async () => {
    setupChangedFiles('M\tsrc/foo.ts\nA\tsrc/bar.ts\n');

    const provider = new DiffProvider();
    const violations = await provider.getScopeViolations(
      ['src/foo.ts', 'src/bar.ts'],
      []
    );

    expect(violations).toEqual([]);
  });

  it('returns all changed files when relevant_files is empty', async () => {
    setupChangedFiles('M\tsrc/foo.ts\n');

    const provider = new DiffProvider();
    const violations = await provider.getScopeViolations([], []);

    expect(violations).toEqual([{ path: 'src/foo.ts', status: 'modified' }]);
  });
});

// ---------------------------------------------------------------------------
// openDiffForFile / openAllDiffs
// ---------------------------------------------------------------------------

describe('DiffProvider.openDiffForFile', () => {
  it('opens a HEAD ↔ working tree diff using the git URI scheme', async () => {
    mockExecCommand.mockResolvedValue({ stdout: '3\t1\tsrc/a.ts\n', stderr: '', exitCode: 0, success: true });
    await new DiffProvider().openDiffForFile('src/a.ts');

    const abs = path.join('/workspace', 'src/a.ts');
    expect(mockExecCommand).toHaveBeenCalledWith('git diff --numstat HEAD -- "src/a.ts"', { cwd: '/workspace' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      { scheme: 'git', query: JSON.stringify({ path: abs, ref: 'HEAD' }), fsPath: abs },
      expect.objectContaining({ fsPath: abs }),
      'a.ts (HEAD ↔ Working Tree)'
    );
  });

  it('opens binary files directly instead of diffing', async () => {
    mockExecCommand.mockResolvedValue({ stdout: '-\t-\timg.png\n', stderr: '', exitCode: 0, success: true });
    await new DiffProvider().openDiffForFile('img.png');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('img.png: binary file — diff skipped');
    expect(vscode.commands.executeCommand).toHaveBeenCalledOnce();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.open', expect.objectContaining({ fsPath: path.join('/workspace', 'img.png') }));
  });

  it('still opens a diff when the numstat check fails', async () => {
    mockExecCommand.mockResolvedValue({ stdout: '-\t-\tx', stderr: 'err', exitCode: 1, success: false });
    await new DiffProvider().openDiffForFile('x');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.diff', expect.anything(), expect.anything(), expect.any(String));
  });

  it('does nothing without a workspace', async () => {
    vi.mocked(getWorkspaceRoot).mockReturnValueOnce(undefined);
    await new DiffProvider().openDiffForFile('x');
    expect(mockExecCommand).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('DiffProvider.openAllDiffs', () => {
  it('opens one diff per changed file, in order', async () => {
    const provider = new DiffProvider();
    vi.spyOn(provider, 'getChangedFiles').mockResolvedValue([
      { path: 'a.ts', status: 'modified' },
      { path: 'b.ts', status: 'added' },
    ]);
    const open = vi.spyOn(provider, 'openDiffForFile').mockResolvedValue();
    await provider.openAllDiffs();
    expect(open.mock.calls).toEqual([['a.ts'], ['b.ts']]);
  });

  it('returns no changes without a workspace', async () => {
    vi.mocked(getWorkspaceRoot).mockReturnValueOnce(undefined);
    expect(await new DiffProvider().getChangedFiles()).toEqual([]);
  });
});

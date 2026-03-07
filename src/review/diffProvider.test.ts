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

import { DiffProvider } from './diffProvider';
import { execCommand } from '../utils/shell';

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

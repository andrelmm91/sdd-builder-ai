import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

const workspace = vi.hoisted(() => ({
  workspaceFolders: [{ uri: { fsPath: '/ws' } }] as { uri: { fsPath: string } }[] | undefined,
  findFiles: vi.fn(),
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createDirectory: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('vscode', () => ({
  workspace,
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import {
  getWorkspaceRoot,
  readWorkspaceFile,
  writeWorkspaceFile,
  listFiles,
  createWorkspaceDirectory,
  fileExists,
} from './fileSystem';

const ROOT = '/ws';
const abs = (rel: string) => path.join(ROOT, rel);

beforeEach(() => {
  vi.resetAllMocks();
  workspace.workspaceFolders = [{ uri: { fsPath: ROOT } }];
});

describe('getWorkspaceRoot', () => {
  it('returns the first workspace folder path', () => {
    workspace.workspaceFolders = [{ uri: { fsPath: '/first' } }, { uri: { fsPath: '/second' } }];
    expect(getWorkspaceRoot()).toBe('/first');
  });

  it('returns undefined with no folders open', () => {
    workspace.workspaceFolders = undefined;
    expect(getWorkspaceRoot()).toBeUndefined();
    workspace.workspaceFolders = [];
    expect(getWorkspaceRoot()).toBeUndefined();
  });
});

describe('readWorkspaceFile', () => {
  it('reads and decodes a UTF-8 file relative to the root', async () => {
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode('héllo'));
    await expect(readWorkspaceFile('.sdd/config.json')).resolves.toBe('héllo');
    expect(workspace.fs.readFile).toHaveBeenCalledWith({ fsPath: abs('.sdd/config.json') });
  });

  it('returns undefined when the file cannot be read', async () => {
    workspace.fs.readFile.mockRejectedValue(new Error('ENOENT'));
    await expect(readWorkspaceFile('missing')).resolves.toBeUndefined();
  });

  it('returns undefined without a workspace', async () => {
    workspace.workspaceFolders = undefined;
    await expect(readWorkspaceFile('x')).resolves.toBeUndefined();
    expect(workspace.fs.readFile).not.toHaveBeenCalled();
  });
});

describe('writeWorkspaceFile', () => {
  it('creates the parent directory, then writes UTF-8 content', async () => {
    await writeWorkspaceFile('a/b/c.txt', 'data');
    expect(workspace.fs.createDirectory).toHaveBeenCalledWith({ fsPath: path.dirname(abs('a/b/c.txt')) });
    const [uri, bytes] = workspace.fs.writeFile.mock.calls[0];
    expect(uri).toEqual({ fsPath: abs('a/b/c.txt') });
    expect(Buffer.from(bytes).toString('utf8')).toBe('data');
    expect(workspace.fs.createDirectory.mock.invocationCallOrder[0])
      .toBeLessThan(workspace.fs.writeFile.mock.invocationCallOrder[0]);
  });

  it('throws without a workspace', async () => {
    workspace.workspaceFolders = undefined;
    await expect(writeWorkspaceFile('x', 'y')).rejects.toThrow('No workspace folder is open');
  });

  it('propagates write errors', async () => {
    workspace.fs.writeFile.mockRejectedValue(new Error('EACCES'));
    await expect(writeWorkspaceFile('x', 'y')).rejects.toThrow('EACCES');
  });
});

describe('listFiles', () => {
  it('returns workspace-relative POSIX paths', async () => {
    workspace.findFiles.mockResolvedValue([{ fsPath: abs('.specs/a.sdd.md') }, { fsPath: abs('src/x/y.ts') }]);
    await expect(listFiles('**/*')).resolves.toEqual(['.specs/a.sdd.md', 'src/x/y.ts']);
    expect(workspace.findFiles).toHaveBeenCalledWith('**/*');
  });

  it('returns absolute paths without a workspace', async () => {
    workspace.workspaceFolders = undefined;
    workspace.findFiles.mockResolvedValue([{ fsPath: '/abs/file.ts' }]);
    await expect(listFiles('*')).resolves.toEqual(['/abs/file.ts']);
  });
});

describe('createWorkspaceDirectory', () => {
  it('creates the directory relative to the root', async () => {
    await createWorkspaceDirectory('.sdd/skills');
    expect(workspace.fs.createDirectory).toHaveBeenCalledWith({ fsPath: abs('.sdd/skills') });
  });

  it('throws without a workspace', async () => {
    workspace.workspaceFolders = undefined;
    await expect(createWorkspaceDirectory('x')).rejects.toThrow('No workspace folder is open');
  });
});

describe('fileExists', () => {
  it('returns true when stat succeeds', async () => {
    workspace.fs.stat.mockResolvedValue({ type: 1 });
    await expect(fileExists('a.ts')).resolves.toBe(true);
    expect(workspace.fs.stat).toHaveBeenCalledWith({ fsPath: abs('a.ts') });
  });

  it('returns false when stat fails', async () => {
    workspace.fs.stat.mockRejectedValue(new Error('ENOENT'));
    await expect(fileExists('a.ts')).resolves.toBe(false);
  });

  it('returns false without a workspace', async () => {
    workspace.workspaceFolders = undefined;
    await expect(fileExists('a.ts')).resolves.toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ws = vi.hoisted(() => ({
  workspaceFolders: [{ uri: { fsPath: '/ws' } }] as { uri: { fsPath: string } }[] | undefined,
  fs: { writeFile: vi.fn() },
}));

vi.mock('vscode', () => ({
  window: {
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(),
  },
  workspace: ws,
  Uri: { joinPath: (base: { fsPath: string }, p: string) => ({ fsPath: `${base.fsPath}/${p}` }) },
}));
vi.mock('../utils/fileSystem', () => ({ listFiles: vi.fn() }));
vi.mock('../config/extensionConfig', () => ({ getSpecPrefix: vi.fn() }));

import * as vscode from 'vscode';
import { newSpec } from './newSpec';
import { listFiles } from '../utils/fileSystem';
import { getSpecPrefix } from '../config/extensionConfig';
import { parseSpec } from '../specs/parser';

const quickPick = vi.mocked(vscode.window.showQuickPick);
const inputBox = vi.mocked(vscode.window.showInputBox);

function written(): { path: string; content: string } {
  const [uri, bytes] = ws.fs.writeFile.mock.calls[0];
  return { path: uri.fsPath, content: Buffer.from(bytes).toString('utf8') };
}

beforeEach(() => {
  vi.clearAllMocks();
  ws.workspaceFolders = [{ uri: { fsPath: '/ws' } }];
  vi.mocked(getSpecPrefix).mockResolvedValue('SDD');
  vi.mocked(listFiles).mockResolvedValue([]);
});

describe('newSpec', () => {
  it('offers the three templates with descriptions', async () => {
    quickPick.mockResolvedValue(undefined);
    await newSpec();
    const items = quickPick.mock.calls[0][0] as { label: string; description: string }[];
    expect(items.map((i) => i.label)).toEqual(['feature', 'bugfix', 'refactor']);
    expect(items.every((i) => i.description.length > 0)).toBe(true);
  });

  it('aborts when the template pick is cancelled', async () => {
    quickPick.mockResolvedValue(undefined);
    await newSpec();
    expect(inputBox).not.toHaveBeenCalled();
    expect(ws.fs.writeFile).not.toHaveBeenCalled();
  });

  it('aborts when the title prompt is cancelled', async () => {
    quickPick.mockResolvedValue({ label: 'feature' } as never);
    inputBox.mockResolvedValue(undefined);
    await newSpec();
    expect(ws.fs.writeFile).not.toHaveBeenCalled();
  });

  it('writes the next sequential spec with a slugified file name and opens it', async () => {
    quickPick.mockResolvedValue({ label: 'bugfix' } as never);
    inputBox.mockResolvedValue('Fix: Login  crash!');
    vi.mocked(listFiles).mockResolvedValue([
      '.specs/SDD-001-first.sdd.md',
      '.specs/nested/SDD-004-second.sdd.md',
      '.specs/OTHER-009-x.sdd.md',
      '.specs/notes.sdd.md',
    ]);

    await newSpec();

    const file = written();
    expect(file.path).toBe('/ws/.specs/SDD-005-fix-login-crash.sdd.md');
    const parsed = parseSpec(file.content);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.frontmatter).toMatchObject({ spec_id: 'SDD-005', title: 'Fix: Login  crash!', tags: ['bugfix'] });
    }
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith({ fsPath: file.path });
  });

  it('uses the spec ID for the file name and a placeholder title when the title is empty', async () => {
    quickPick.mockResolvedValue({ label: 'feature' } as never);
    inputBox.mockResolvedValue('');
    await newSpec();
    const file = written();
    expect(file.path).toBe('/ws/.specs/SDD-001-sdd-001.sdd.md');
    expect(file.content).toContain('title: <!-- Spec title for SDD-001 -->');
  });

  it('errors when no workspace is open', async () => {
    ws.workspaceFolders = undefined;
    quickPick.mockResolvedValue({ label: 'refactor' } as never);
    inputBox.mockResolvedValue('X');
    await newSpec();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open.');
    expect(ws.fs.writeFile).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    activeTextEditor: undefined,
  },
  workspace: { fs: { readFile: vi.fn() } },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import * as vscode from 'vscode';
import { createValidateSpecCommand } from './validateSpec';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');
const fixtureBytes = (name: string) => fs.readFileSync(path.join(FIXTURES, name));

const readFile = vi.mocked(vscode.workspace.fs.readFile);
const showError = vi.mocked(vscode.window.showErrorMessage);
const showInfo = vi.mocked(vscode.window.showInformationMessage);

function setEditor(fileName: string | undefined) {
  (vscode.window as Record<string, unknown>)['activeTextEditor'] = fileName ? { document: { fileName } } : undefined;
}

const specItem = (filePath: string) => ({ kind: 'spec', filePath }) as unknown as SpecTreeItem;

describe('createValidateSpecCommand', () => {
  const command = createValidateSpecCommand();

  beforeEach(() => {
    vi.clearAllMocks();
    setEditor(undefined);
  });

  it('errors when no spec is selected or open', async () => {
    await command();
    expect(showError).toHaveBeenCalledWith('No spec file selected or open.');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('ignores an active editor that is not a spec file', async () => {
    setEditor('/ws/readme.md');
    await command();
    expect(showError).toHaveBeenCalledWith('No spec file selected or open.');
  });

  it('ignores tree items that are not specs', async () => {
    await command({ kind: 'group' } as unknown as SpecTreeItem);
    expect(showError).toHaveBeenCalledWith('No spec file selected or open.');
  });

  it('reports a valid spec from a tree item', async () => {
    readFile.mockResolvedValue(fixtureBytes('sample-spec.sdd.md'));
    await command(specItem('/ws/.specs/SDD-099.sdd.md'));
    expect(readFile).toHaveBeenCalledWith({ fsPath: '/ws/.specs/SDD-099.sdd.md' });
    expect(showInfo).toHaveBeenCalledWith('✓ SDD-099 is valid.');
  });

  it('falls back to the active .sdd.md editor', async () => {
    setEditor('/ws/.specs/open.sdd.md');
    readFile.mockResolvedValue(fixtureBytes('sample-spec.sdd.md'));
    await command();
    expect(readFile).toHaveBeenCalledWith({ fsPath: '/ws/.specs/open.sdd.md' });
    expect(showInfo).toHaveBeenCalled();
  });

  it('summarises errors and warnings for an invalid spec', async () => {
    readFile.mockResolvedValue(fixtureBytes('invalid-spec.sdd.md'));
    await command(specItem('/ws/bad.sdd.md'));
    const msg = showError.mock.calls[0][0] as string;
    expect(msg).toMatch(/^Validation: \d+ error\(s\), 2 warning\(s\)\./);
    expect(msg).toContain('[error] Context section must be non-empty');
    expect(msg).toContain('[warning] Missing constraints section');
  });

  it('shows a parse error for malformed frontmatter', async () => {
    readFile.mockResolvedValue(Buffer.from('---\ntitle: [x\n---\n'));
    await command(specItem('/ws/p.sdd.md'));
    expect(showError.mock.calls[0][0]).toMatch(/^Parse error: YAML parse error/);
  });

  it('shows a read error with the file name', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    await command(specItem(path.join('ws', 'gone.sdd.md')));
    expect(showError).toHaveBeenCalledWith('Could not read spec file: gone.sdd.md');
  });
});

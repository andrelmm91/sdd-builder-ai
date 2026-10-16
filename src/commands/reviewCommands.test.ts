import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  workspace: { fs: { readFile: vi.fn(), writeFile: vi.fn() } },
}));

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
}));

vi.mock('../execution/resultCapture', () => ({ getLatestExecution: vi.fn() }));
vi.mock('../execution/gitCheckpoint', () => ({ restoreCheckpoint: vi.fn() }));
vi.mock('../review/reviewManager', () => ({ ReviewManager: class {} }));
vi.mock('../review/diffProvider', () => ({ DiffProvider: class {} }));

import * as vscode from 'vscode';
import { discardExecutionChanges, applyRequestChanges, resolveSpec } from './reviewCommands';
import { getWorkspaceRoot, writeWorkspaceFile, listFiles, readWorkspaceFile } from '../utils/fileSystem';
import { getLatestExecution } from '../execution/resultCapture';
import { restoreCheckpoint } from '../execution/gitCheckpoint';

const mockWarn = vi.mocked(vscode.window.showWarningMessage);
const mockInfo = vi.mocked(vscode.window.showInformationMessage);
const mockLatest = vi.mocked(getLatestExecution);
const mockRestore = vi.mocked(restoreCheckpoint);

const checkpoint = { headSha: 'a', baseSha: 'a', untrackedBefore: [], createdAt: '' };
const record = {
  specId: 'SDD-1', executionNumber: 3, timestamp: '', status: 'completed' as const,
  duration: 1, testsPassed: null, prUrl: null,
  changedFiles: ['M a.ts', 'A b.ts'], checkpoint,
};
const restoreOk = { restored: ['a.ts'], deleted: ['b.ts'], skipped: [], headMoved: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getWorkspaceRoot).mockReturnValue('/ws');
});

describe('discardExecutionChanges', () => {
  it('returns false when there is no record', async () => {
    mockLatest.mockResolvedValue(undefined);
    expect(await discardExecutionChanges('SDD-1')).toBe(false);
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('warns and returns false when the record has no checkpoint', async () => {
    mockLatest.mockResolvedValue({ ...record, checkpoint: undefined });
    expect(await discardExecutionChanges('SDD-1')).toBe(false);
    expect(mockWarn).toHaveBeenCalledWith(
      'No checkpoint available for SDD-1; changes cannot be discarded automatically.'
    );
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('returns false when the user cancels', async () => {
    mockLatest.mockResolvedValue(record);
    mockWarn.mockResolvedValue(undefined as never);
    expect(await discardExecutionChanges('SDD-1')).toBe(false);
    expect(mockWarn.mock.calls[0][0]).toBe(
      'Discard 2 file change(s) made by the AI for SDD-1? This cannot be undone.'
    );
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('skips the dialog with confirm:false and restores', async () => {
    mockLatest.mockResolvedValue(record);
    mockRestore.mockResolvedValue(restoreOk);
    expect(await discardExecutionChanges('SDD-1', { confirm: false })).toBe(true);
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockRestore).toHaveBeenCalledWith(checkpoint, record.changedFiles, '/ws');
    expect(mockInfo).toHaveBeenCalled();
  });

  it('restores after the user confirms', async () => {
    mockLatest.mockResolvedValue(record);
    mockWarn.mockResolvedValue('Discard' as never);
    mockRestore.mockResolvedValue(restoreOk);
    expect(await discardExecutionChanges('SDD-1')).toBe(true);
  });

  it('warns when HEAD moved', async () => {
    mockLatest.mockResolvedValue(record);
    mockRestore.mockResolvedValue({ ...restoreOk, headMoved: true });
    await discardExecutionChanges('SDD-1', { confirm: false });
    expect(mockWarn).toHaveBeenCalledWith(
      'The AI created commit(s) after the checkpoint. Files were restored, but the commits remain; use git to remove them if needed.'
    );
  });

  it('returns false when nothing was restored', async () => {
    mockLatest.mockResolvedValue(record);
    mockRestore.mockResolvedValue({ restored: [], deleted: [], skipped: [], headMoved: false });
    expect(await discardExecutionChanges('SDD-1', { confirm: false })).toBe(false);
  });
});

describe('applyRequestChanges', () => {
  it('never restores files and flags the latest record to reuse its checkpoint', async () => {
    const spec = '---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\nx\n';
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from(spec));
    mockLatest.mockResolvedValue(record);

    await applyRequestChanges('/ws/spec.sdd.md', 'fix it');

    expect(mockRestore).not.toHaveBeenCalled();
    const call = vi.mocked(writeWorkspaceFile).mock.calls[0];
    expect(call[0]).toBe('.sdd/executions/SDD-1/exec-003.json');
    expect(JSON.parse(call[1])).toMatchObject({ checkpoint, reuseCheckpointOnNextRun: true });
  });
});

describe('resolveSpec', () => {
  const specs: Record<string, string> = {
    '.specs/a.sdd.md': '---\nspec_id: SDD-1\ntitle: One\nstatus: review\n---\n',
    '.specs/b.sdd.md': '---\nspec_id: SDD-2\ntitle: Two\nstatus: ready\n---\n',
  };

  beforeEach(() => {
    vi.mocked(listFiles).mockResolvedValue(Object.keys(specs));
    vi.mocked(readWorkspaceFile).mockImplementation(async (f) => specs[f]);
  });

  it('resolves a bare spec ID (Kanban board) to its file', async () => {
    const spec = await resolveSpec('SDD-2');
    expect(spec).toMatchObject({ specId: 'SDD-2', filePath: path.join('/ws', '.specs/b.sdd.md') });
  });

  it('returns undefined for an unknown spec ID', async () => {
    expect(await resolveSpec('SDD-404')).toBeUndefined();
  });

  it('resolves a spec file path via its frontmatter', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from(specs['.specs/a.sdd.md']));
    expect(await resolveSpec('/ws/.specs/a.sdd.md')).toEqual({ specId: 'SDD-1', filePath: '/ws/.specs/a.sdd.md' });
  });

  it('asks the user to pick among review specs when no argument is given', async () => {
    vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => (items as unknown[])[0] as never);
    const spec = await resolveSpec(undefined);
    const offered = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as { label: string }[];
    expect(offered.map((i) => i.label)).toEqual(['SDD-1']);
    expect(spec?.specId).toBe('SDD-1');
  });

  it('returns undefined when the pick is cancelled', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
    expect(await resolveSpec(undefined)).toBeUndefined();
  });
});

describe('package.json', () => {
  it('declares sdd.discardChanges', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const cmds = pkg.contributes.commands.map((c: { command: string }) => c.command);
    expect(cmds).toContain('sdd.discardChanges');
  });
});

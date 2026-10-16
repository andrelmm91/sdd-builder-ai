import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  workspace: { fs: { readFile: vi.fn(), writeFile: vi.fn() } },
}));

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));

vi.mock('../execution/resultCapture', () => ({ getLatestExecution: vi.fn() }));
vi.mock('../execution/gitCheckpoint', () => ({ restoreCheckpoint: vi.fn() }));
vi.mock('../review/reviewManager', () => ({ ReviewManager: class {} }));
vi.mock('../review/diffProvider', () => ({ DiffProvider: class {} }));

import * as vscode from 'vscode';
import { discardExecutionChanges, applyRequestChanges } from './reviewCommands';
import { getWorkspaceRoot, writeWorkspaceFile } from '../utils/fileSystem';
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

describe('package.json', () => {
  it('declares sdd.discardChanges', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const cmds = pkg.contributes.commands.map((c: { command: string }) => c.command);
    expect(cmds).toContain('sdd.discardChanges');
  });
});

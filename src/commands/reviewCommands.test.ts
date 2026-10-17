import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
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
const review = vi.hoisted(() => ({ openReview: vi.fn(), submitDecision: vi.fn() }));
vi.mock('../review/reviewManager', () => ({
  ReviewManager: class {
    openReview = review.openReview;
    submitDecision = review.submitDecision;
  },
}));
vi.mock('../review/diffProvider', () => ({ DiffProvider: class {} }));

import * as vscode from 'vscode';
import {
  discardExecutionChanges,
  applyRequestChanges,
  resolveSpec,
  createApproveSpecCommand,
  createRejectSpecCommand,
  createRequestChangesCommand,
  createReviewSpecCommand,
  createDiscardChangesCommand,
} from './reviewCommands';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';
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

describe('discardExecutionChanges — edge cases', () => {
  it('lists files it could not revert', async () => {
    mockLatest.mockResolvedValue(record);
    mockRestore.mockResolvedValue({ restored: ['a.ts'], deleted: [], skipped: [{ path: 'b.ts', reason: 'locked' }], headMoved: false });
    expect(await discardExecutionChanges('SDD-1', { confirm: false })).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith('Discarded 1 file(s) for SDD-1; could not revert: b.ts (locked)');
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('errors without a workspace', async () => {
    mockLatest.mockResolvedValue(record);
    vi.mocked(getWorkspaceRoot).mockReturnValue(undefined);
    expect(await discardExecutionChanges('SDD-1', { confirm: false })).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder is open.');
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('treats a record without changedFiles as zero changes', async () => {
    mockLatest.mockResolvedValue({ ...record, changedFiles: undefined });
    mockWarn.mockResolvedValue(undefined as never);
    await discardExecutionChanges('SDD-1');
    expect(mockWarn.mock.calls[0][0]).toContain('Discard 0 file change(s)');
  });
});

describe('applyRequestChanges — spec body', () => {
  async function apply(spec: string, feedback = 'Please fix X') {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from(spec));
    await applyRequestChanges('/ws/spec.sdd.md', feedback);
    const [uri, bytes] = vi.mocked(vscode.workspace.fs.writeFile).mock.calls[0];
    expect(uri).toEqual({ fsPath: '/ws/spec.sdd.md' });
    return Buffer.from(bytes as Uint8Array).toString('utf8');
  }

  it('inserts feedback at the end of Context, before the next section, and sets status ready', async () => {
    const out = await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\n\nOriginal.\n\n## Requirements\n\n### Functional\n- a\n');
    expect(out).toBe(
      '---\nspec_id: SDD-1\nstatus: ready\n---\n\n## Context\n\nOriginal.\n\nFeedback for re-execution: Please fix X\n\n## Requirements\n\n### Functional\n- a'.trimEnd() + '\n'
    );
  });

  it('keeps ### sub-headings inside Context', async () => {
    const out = await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\nIntro\n### Notes\nn\n## Constraints\n- c\n');
    expect(out).toContain('### Notes\nn\n\nFeedback for re-execution: Please fix X\n\n## Constraints');
  });

  it('appends at the end when Context is the last section', async () => {
    const out = await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Requirements\n- a\n\n## Context\nlast\n\n\n');
    expect(out.endsWith('## Context\nlast\n\nFeedback for re-execution: Please fix X')).toBe(true);
  });

  it('appends at the end when there is no Context section', async () => {
    const out = await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Requirements\n- a\n');
    expect(out.endsWith('- a\n\nFeedback for re-execution: Please fix X')).toBe(true);
  });

  it('accumulates feedback across repeated requests', async () => {
    const first = await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\nx\n\n## Constraints\n- c\n', 'one');
    vi.mocked(vscode.workspace.fs.writeFile).mockClear();
    const second = await apply(first.replace('status: ready', 'status: review'), 'two');
    expect(second).toContain('Feedback for re-execution: one\n\nFeedback for re-execution: two\n\n## Constraints');
  });

  it('skips the execution record update when there is no spec_id or no execution', async () => {
    await apply('---\nstatus: review\n---\n\n## Context\nx\n');
    expect(mockLatest).not.toHaveBeenCalled();

    vi.mocked(vscode.workspace.fs.writeFile).mockClear();
    mockLatest.mockResolvedValue(undefined);
    await apply('---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\nx\n');
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe('resolveSpec — other inputs', () => {
  it('uses a sidebar spec item directly', async () => {
    const item = { kind: 'spec', spec: { spec_id: 'SDD-7' }, filePath: '/ws/x.sdd.md' } as unknown as SpecTreeItem;
    expect(await resolveSpec(item)).toEqual({ specId: 'SDD-7', filePath: '/ws/x.sdd.md' });
    expect(listFiles).not.toHaveBeenCalled();
  });

  it('returns undefined for an unreadable or id-less spec path', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('ENOENT'));
    expect(await resolveSpec('/ws/missing.sdd.md')).toBeUndefined();
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from('---\ntitle: x\n---\n'));
    expect(await resolveSpec('nested/no-id.sdd.md')).toBeUndefined();
  });

  it('tells the user when no spec has a pickable status', async () => {
    vi.mocked(listFiles).mockResolvedValue(['.specs/a.sdd.md', '.specs/empty.sdd.md', '.specs/noid.sdd.md']);
    vi.mocked(readWorkspaceFile).mockImplementation(async (f) =>
      f === '.specs/a.sdd.md' ? '---\nspec_id: SDD-1\nstatus: done\n---\n' : f === '.specs/noid.sdd.md' ? '---\ntitle: x\n---\n' : undefined
    );
    expect(await resolveSpec(undefined, ['in_progress', 'review'])).toBeUndefined();
    expect(mockInfo).toHaveBeenCalledWith('No specs in in_progress or review.');
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it('returns no entries without a workspace', async () => {
    vi.mocked(getWorkspaceRoot).mockReturnValue(undefined);
    expect(await resolveSpec('SDD-1')).toBeUndefined();
  });
});

describe('review commands', () => {
  const refresh = vi.fn();
  const SPEC = '---\nspec_id: SDD-1\nstatus: review\n---\n\n## Context\nx\n';

  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(listFiles).mockResolvedValue(['.specs/a.sdd.md']);
    vi.mocked(readWorkspaceFile).mockResolvedValue(SPEC);
  });

  it('reports an explicit spec ID that cannot be found', async () => {
    await createApproveSpecCommand(refresh)('SDD-404');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Spec not found: SDD-404');
    expect(review.submitDecision).not.toHaveBeenCalled();
  });

  it('reports an unresolvable tree item', async () => {
    await createRejectSpecCommand(refresh)({ kind: 'group' } as unknown as SpecTreeItem);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No spec selected.');
  });

  describe('approve', () => {
    it('submits the decision after confirmation', async () => {
      mockInfo.mockResolvedValueOnce('Approve' as never);
      await createApproveSpecCommand(refresh)('SDD-1');
      expect(mockInfo).toHaveBeenNthCalledWith(1, 'Approve spec SDD-1?', { modal: true }, 'Approve');
      expect(review.submitDecision).toHaveBeenCalledWith('SDD-1', 'approve');
      expect(refresh).toHaveBeenCalledOnce();
      expect(mockInfo).toHaveBeenLastCalledWith('SDD-1 approved.');
    });

    it('does nothing when not confirmed', async () => {
      mockInfo.mockResolvedValueOnce(undefined as never);
      await createApproveSpecCommand(refresh)('SDD-1');
      expect(review.submitDecision).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('shows an error when the decision fails', async () => {
      mockInfo.mockResolvedValueOnce('Approve' as never);
      review.submitDecision.mockRejectedValueOnce(new Error('disk full'));
      await createApproveSpecCommand(refresh)('SDD-1');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Approve failed: disk full');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('submits the decision and refreshes', async () => {
      await createRejectSpecCommand(refresh)('SDD-1');
      expect(review.submitDecision).toHaveBeenCalledWith('SDD-1', 'reject');
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('shows an error when the decision fails', async () => {
      review.submitDecision.mockRejectedValueOnce('boom');
      await createRejectSpecCommand(refresh)('SDD-1');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Reject failed: boom');
    });
  });

  describe('request changes', () => {
    it('does nothing when the feedback prompt is cancelled', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
      await createRequestChangesCommand(refresh)('SDD-1');
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('applies the feedback to the spec file and refreshes', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('needs tests');
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from(SPEC));
      await createRequestChangesCommand(refresh)('SDD-1');
      const [uri, bytes] = vi.mocked(vscode.workspace.fs.writeFile).mock.calls[0];
      expect(uri).toEqual({ fsPath: path.join('/ws', '.specs/a.sdd.md') });
      expect(Buffer.from(bytes as Uint8Array).toString('utf8')).toContain('Feedback for re-execution: needs tests');
      expect(refresh).toHaveBeenCalledOnce();
      expect(mockInfo).toHaveBeenCalledWith('SDD-1 moved back to Ready with feedback.');
    });

    it('shows an error when the spec cannot be updated', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('x');
      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('EACCES'));
      await createRequestChangesCommand(refresh)('SDD-1');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Request changes failed: EACCES');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('review', () => {
    it('opens the review for the resolved spec', async () => {
      await createReviewSpecCommand(refresh)('SDD-1');
      expect(review.openReview).toHaveBeenCalledWith('SDD-1');
    });
  });

  describe('discard', () => {
    it('refreshes only when something was discarded', async () => {
      mockLatest.mockResolvedValue(record);
      mockWarn.mockResolvedValue('Discard' as never);
      mockRestore.mockResolvedValueOnce(restoreOk);
      await createDiscardChangesCommand(refresh)('SDD-1');
      expect(refresh).toHaveBeenCalledOnce();

      mockRestore.mockResolvedValueOnce({ restored: [], deleted: [], skipped: [], headMoved: false });
      await createDiscardChangesCommand(refresh)('SDD-1');
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('shows an error when restoring throws', async () => {
      mockLatest.mockRejectedValue(new Error('git failed'));
      await createDiscardChangesCommand(refresh)('SDD-1');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Discard failed: git failed');
    });
  });
});

describe('package.json', () => {
  it('declares sdd.discardChanges', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const cmds = pkg.contributes.commands.map((c: { command: string }) => c.command);
    expect(cmds).toContain('sdd.discardChanges');
  });
});

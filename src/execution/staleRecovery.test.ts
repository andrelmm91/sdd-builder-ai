import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn() },
}));
vi.mock('../utils/fileSystem', () => ({
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));
vi.mock('../commands/executeSpec', () => ({
  isExecutionRunning: vi.fn(),
}));

import * as vscode from 'vscode';
import { listFiles, readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { isExecutionRunning } from '../commands/executeSpec';
import { findStaleSpecs, recoverStaleSpecs } from './staleRecovery';

const spec = (id: string, status: string) =>
  `---\nspec_id: ${id}\ntitle: T\nstatus: ${status}\n---\n\n## Context\nbody\n`;

const files: Record<string, string> = {
  '.specs/a.sdd.md': spec('SDD-001', 'in_progress'),
  '.specs/b.sdd.md': spec('SDD-002', 'ready'),
};

describe('staleRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isExecutionRunning).mockReturnValue(false);
    vi.mocked(listFiles).mockResolvedValue(Object.keys(files));
    vi.mocked(readWorkspaceFile).mockImplementation(async (p) => files[p]);
  });

  it('findStaleSpecs returns only in_progress specs', async () => {
    expect(await findStaleSpecs()).toEqual([{ specId: 'SDD-001', filePath: '.specs/a.sdd.md' }]);
  });

  it('does not notify when there are no stale specs', async () => {
    vi.mocked(listFiles).mockResolvedValue(['.specs/b.sdd.md']);
    await recoverStaleSpecs();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('rewrites stale specs to ready on "Reset to Ready"', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Reset to Ready' as never);
    await recoverStaleSpecs();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      '1 spec(s) were left In Progress by a previous session.',
      'Reset to Ready',
      'Ignore',
    );
    expect(writeWorkspaceFile).toHaveBeenCalledTimes(1);
    const [p, content] = vi.mocked(writeWorkspaceFile).mock.calls[0];
    expect(p).toBe('.specs/a.sdd.md');
    expect(content).toContain('status: ready');
    expect(content).toContain('body');
  });

  it('leaves files untouched on "Ignore"', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Ignore' as never);
    await recoverStaleSpecs();
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it('is a no-op while an execution is running', async () => {
    vi.mocked(isExecutionRunning).mockReturnValue(true);
    await recoverStaleSpecs();
    expect(listFiles).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });
});

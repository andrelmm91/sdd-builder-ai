import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    withProgress: vi.fn(),
    activeTextEditor: undefined,
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => p }),
  },
  ProgressLocation: { Notification: 15 },
}));

// Control the singleton runner's behaviour across tests
const mockRunnerIsRunning = vi.fn().mockReturnValue(false);
const mockRunnerAbort = vi.fn();
const mockRunnerExecute = vi.fn();

vi.mock('../execution/cliRunner', () => ({
  CliRunner: class MockCliRunner {
    isRunning() { return mockRunnerIsRunning(); }
    abort() { return mockRunnerAbort(); }
    execute(...args: unknown[]) { return mockRunnerExecute(...args); }
  },
}));

vi.mock('../utils/shell', () => ({
  isCommandAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/extensionConfig', () => ({
  getClaudeCliBinary: vi.fn().mockReturnValue('claude'),
  getProviderBinary: (cfg: { provider?: string } | undefined, claude = 'claude') =>
    cfg?.provider === 'copilot' ? 'gh' : claude,
  getCliNotFoundMessage: (cfg: { provider?: string } | undefined, bin: string) =>
    `${cfg?.provider === 'copilot' ? 'Copilot' : 'Claude'} CLI not found: "${bin}".`,
  getTestCommand: vi.fn().mockResolvedValue('npm test'),
  getAutoValidate: vi.fn().mockReturnValue(false),
}));

vi.mock('../execution/skillsLoader', () => ({
  loadSkills: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/aiConfig', () => ({
  readAIConfig: vi.fn().mockResolvedValue({ permissionMode: 'dangerously-skip-permissions', provider: 'claude' }),
}));

vi.mock('../execution/contextAssembler', () => ({
  assembleExecutionContext: vi.fn().mockResolvedValue('assembled context'),
}));

vi.mock('../execution/resultCapture', () => ({
  captureResults: vi.fn().mockResolvedValue({
    record: { specId: 'SDD-030', executionNumber: 1 },
    logPath: '.sdd/executions/SDD-030/exec-001.log',
    changedFiles: [],
  }),
  getLatestExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../execution/gitCheckpoint', () => ({
  createCheckpoint: vi.fn(),
}));

vi.mock('../execution/postValidation', () => ({
  runPostValidation: vi.fn().mockResolvedValue({ passed: true, output: '', duration: 10, command: 'npm test' }),
}));

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
  readWorkspaceFile: vi.fn().mockResolvedValue(undefined),
  writeWorkspaceFile: vi.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { createExecuteSpecCommand, _resetNoGitNoticeForTesting } from './executeSpec';
import { isCommandAvailable } from '../utils/shell';
import { readAIConfig } from '../config/aiConfig';
import { captureResults, getLatestExecution } from '../execution/resultCapture';
import { createCheckpoint } from '../execution/gitCheckpoint';
import type { GitCheckpoint } from '../execution/types';

function makeSpecContent(status: string): string {
  return `---
spec_id: SDD-030
title: Wire spec execution command to VS Code UI
status: ${status}
priority: high
complexity: medium
tags: [phase-2, frontend]
relevant_files:
  - src/extension.ts
must_not_touch: []
depends_on: []
agent_skills: frontend-dev
created: 2026-03-05
---

## Context

Wire execution engine into VS Code.

## Requirements

### Functional

- [ ] Execute spec command

### Non-Functional

- [ ] Handle cancellation

## Acceptance Criteria

### Automated

- [ ] TypeScript compilation passes

### Manual

- [ ] Execute from context menu

## Constraints

- Use all execution engine modules
`;
}

describe('createExecuteSpecCommand', () => {
  let refresh: ReturnType<typeof vi.fn>;
  let command: ReturnType<typeof createExecuteSpecCommand>;

  beforeEach(() => {
    vi.clearAllMocks();
    refresh = vi.fn();
    command = createExecuteSpecCommand(refresh);
    mockRunnerIsRunning.mockReturnValue(false);
    vi.mocked(isCommandAvailable).mockResolvedValue(true);
    (vscode.window as Record<string, unknown>)['activeTextEditor'] = undefined;
  });

  it('shows error when no file is selected or open', async () => {
    await command(undefined);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No spec file selected or open.'
    );
  });

  it('shows error when spec status is not "ready"', async () => {
    const content = makeSpecContent('draft');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('must be in "ready" status')
    );
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('shows error when Claude CLI is not available', async () => {
    const content = makeSpecContent('ready');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(isCommandAvailable).mockResolvedValue(false);

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Claude CLI not found')
    );
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('checks the gh binary (not claude) when provider is copilot', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(makeSpecContent('ready')) as unknown as Uint8Array
    );
    vi.mocked(readAIConfig).mockResolvedValueOnce({ provider: 'copilot', permissionMode: 'yolo' } as never);
    vi.mocked(isCommandAvailable).mockResolvedValue(false);

    await command({ kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' } as never);

    expect(isCommandAvailable).toHaveBeenCalledWith('gh');
    expect(isCommandAvailable).not.toHaveBeenCalledWith('claude');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Copilot CLI not found: "gh"')
    );
  });

  it('shows error when another execution is running', async () => {
    const content = makeSpecContent('ready');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    mockRunnerIsRunning.mockReturnValue(true);

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Another spec is currently executing')
    );
    expect(vscode.window.withProgress).not.toHaveBeenCalled();
  });

  it('runs withProgress for a ready spec', async () => {
    const content = makeSpecContent('ready');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(vscode.window.withProgress).mockResolvedValue(undefined);

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({ cancellable: true, title: 'Executing SDD-030' }),
      expect.any(Function)
    );
  });

  it('uses active editor when no tree item is provided', async () => {
    const content = makeSpecContent('ready');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(vscode.window.withProgress).mockResolvedValue(undefined);

    (vscode.window as Record<string, unknown>)['activeTextEditor'] = {
      document: { fileName: '/ws/.specs/SDD-030.sdd.md' },
    };

    await command(undefined);

    expect(vscode.window.withProgress).toHaveBeenCalled();
  });

  describe('checkpoint handling', () => {
    const checkpoint: GitCheckpoint = {
      headSha: 'head1', baseSha: 'base1', untrackedBefore: [], createdAt: '2026-10-15T00:00:00.000Z',
    };
    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };

    beforeEach(() => {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(makeSpecContent('ready')) as unknown as Uint8Array
      );
      // Run the withProgress task with a non-cancelled token
      vi.mocked(vscode.window.withProgress).mockImplementation(
        (async (_o: unknown, task: (p: unknown, t: unknown) => Promise<unknown>) =>
          task({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() })) as never
      );
      mockRunnerExecute.mockResolvedValue({ success: true, output: 'ok', duration: 1 });
      vi.mocked(createCheckpoint).mockResolvedValue(checkpoint);
      vi.mocked(getLatestExecution).mockResolvedValue(undefined);
    });

    it('creates the checkpoint before status moves to in_progress and passes it to captureResults', async () => {
      await command(item as never);

      expect(createCheckpoint).toHaveBeenCalledWith('/workspace');
      const checkpointOrder = vi.mocked(createCheckpoint).mock.invocationCallOrder[0];
      const firstWriteOrder = vi.mocked(vscode.workspace.fs.writeFile).mock.invocationCallOrder[0];
      expect(checkpointOrder).toBeLessThan(firstWriteOrder);
      expect(vi.mocked(vscode.workspace.fs.writeFile).mock.calls[0][1].toString()).toContain('status: in_progress');
      expect(captureResults).toHaveBeenCalledWith('SDD-030', expect.anything(), checkpoint);
    });

    it('reuses the previous checkpoint when reuseCheckpointOnNextRun is set', async () => {
      const previous: GitCheckpoint = { ...checkpoint, baseSha: 'old' };
      vi.mocked(getLatestExecution).mockResolvedValue({
        specId: 'SDD-030', executionNumber: 1, timestamp: '', status: 'completed', duration: 1,
        testsPassed: null, prUrl: null, checkpoint: previous, reuseCheckpointOnNextRun: true,
      });

      await command(item as never);

      expect(createCheckpoint).not.toHaveBeenCalled();
      expect(captureResults).toHaveBeenCalledWith('SDD-030', expect.anything(), previous);
    });

    it('creates a new checkpoint when the latest record has no reuse flag', async () => {
      vi.mocked(getLatestExecution).mockResolvedValue({
        specId: 'SDD-030', executionNumber: 1, timestamp: '', status: 'completed', duration: 1,
        testsPassed: null, prUrl: null, checkpoint: { ...checkpoint, baseSha: 'old' },
      });

      await command(item as never);

      expect(createCheckpoint).toHaveBeenCalledTimes(1);
      expect(captureResults).toHaveBeenCalledWith('SDD-030', expect.anything(), checkpoint);
    });

    it('continues and shows a one-time notice when not in a git repository', async () => {
      vi.mocked(createCheckpoint).mockResolvedValue(undefined);
      _resetNoGitNoticeForTesting();

      await command(item as never);
      await command(item as never);

      expect(captureResults).toHaveBeenCalledWith('SDD-030', expect.anything(), undefined);
      const notices = vi.mocked(vscode.window.showInformationMessage).mock.calls
        .filter(([m]) => String(m).includes('outside a git repository'));
      expect(notices).toHaveLength(1);
    });
  });

  it('shows error on parse failure', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from('not valid frontmatter') as unknown as Uint8Array
    );

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Parse error')
    );
  });

});

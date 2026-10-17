import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

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

const mockBulkIsRunning = vi.fn().mockReturnValue(false);
const mockBulkIsInBulk = vi.fn().mockReturnValue(false);
vi.mock('../execution/bulkExecution', () => ({
  BulkExecutionManager: {
    getInstance: () => ({
      getQueue: () => ({ items: [], isRunning: mockBulkIsRunning(), currentIndex: -1 }),
      isInBulk: (id: string) => mockBulkIsInBulk(id),
    }),
  },
}));

vi.mock('../utils/fileSystem', () => ({
  listFiles: vi.fn().mockResolvedValue([]),
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
  readWorkspaceFile: vi.fn().mockResolvedValue(undefined),
  writeWorkspaceFile: vi.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { createExecuteSpecCommand, _resetNoGitNoticeForTesting } from './executeSpec';
import { isCommandAvailable } from '../utils/shell';
import { readAIConfig } from '../config/aiConfig';
import { listFiles, readWorkspaceFile } from '../utils/fileSystem';
import { captureResults, getLatestExecution } from '../execution/resultCapture';
import { createCheckpoint } from '../execution/gitCheckpoint';
import type { GitCheckpoint } from '../execution/types';

function makeSpecContent(status: string, extraFrontmatter = ''): string {
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
${extraFrontmatter}---

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
  let refresh: Mock<() => void>;
  let command: ReturnType<typeof createExecuteSpecCommand>;

  beforeEach(() => {
    vi.clearAllMocks();
    refresh = vi.fn();
    command = createExecuteSpecCommand(refresh);
    mockRunnerIsRunning.mockReturnValue(false);
    mockBulkIsRunning.mockReturnValue(false);
    mockBulkIsInBulk.mockReturnValue(false);
    vi.mocked(listFiles).mockResolvedValue([]);
    vi.mocked(readWorkspaceFile).mockResolvedValue(undefined);
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

  describe('dependency pre-flight', () => {
    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };

    function setup(depStatus: string | undefined) {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(makeSpecContent('ready').replace('depends_on: []', 'depends_on: [SDD-029]')) as unknown as Uint8Array
      );
      vi.mocked(vscode.window.withProgress).mockResolvedValue(undefined);
      if (depStatus) {
        vi.mocked(listFiles).mockResolvedValue(['.specs/SDD-029.sdd.md']);
        vi.mocked(readWorkspaceFile).mockResolvedValue(
          makeSpecContent(depStatus).replace('SDD-030', 'SDD-029')
        );
      }
    }

    it('does not prompt when dependencies are done', async () => {
      setup('done');
      await command(item as never);
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(vscode.window.withProgress).toHaveBeenCalled();
    });

    it('executes after "Execute Anyway"', async () => {
      setup('draft');
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Execute Anyway' as never);
      await command(item as never);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'SDD-030 depends on specs that are not done: SDD-029. Execute anyway?',
        { modal: true },
        'Execute Anyway',
      );
      expect(vscode.window.withProgress).toHaveBeenCalled();
    });

    it('aborts without touching the spec when dismissed', async () => {
      setup(undefined);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);
      await command(item as never);
      expect(vscode.window.withProgress).not.toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('skips the check and the scan for a spec in a running bulk queue', async () => {
      setup('review');
      mockBulkIsRunning.mockReturnValue(true);
      mockBulkIsInBulk.mockReturnValue(true);
      await command(item as never);
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(listFiles).not.toHaveBeenCalled();
      expect(vscode.window.withProgress).toHaveBeenCalled();
    });
  });

  describe('run options and timeout', () => {
    async function run(options?: { model?: string }) {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(makeSpecContent('ready')) as unknown as Uint8Array
      );
      vi.mocked(vscode.window.withProgress).mockImplementation(async (_o, task) =>
        task({ report: vi.fn() } as never, { onCancellationRequested: vi.fn(), isCancellationRequested: false } as never)
      );
      mockRunnerExecute.mockResolvedValue({ success: true, output: '', duration: 1 });
      await command({ kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' } as never, options);
      return {
        title: (vi.mocked(vscode.window.withProgress).mock.calls[0]?.[0] as { title: string } | undefined)?.title,
        config: mockRunnerExecute.mock.calls[0]?.[1] as { timeoutMs?: number } | undefined,
        aiConfig: mockRunnerExecute.mock.calls[0]?.[2] as { provider: string; model: string; permissionMode: string } | undefined,
      };
    }

    beforeEach(() => {
      vi.mocked(readAIConfig).mockResolvedValue(
        { permissionMode: 'dangerously-skip-permissions', provider: 'claude', model: 'sonnet' } as never
      );
    });

    it('runs with the chosen model for this run only and shows it in the title', async () => {
      const r = await run({ model: 'haiku' });
      expect(r.aiConfig).toMatchObject({ provider: 'claude', model: 'haiku', permissionMode: 'dangerously-skip-permissions' });
      expect(r.title).toBe('Executing SDD-030 (haiku)');
    });

    it('treats the AI Config model as no override', async () => {
      const r = await run({ model: 'sonnet' });
      expect(r.aiConfig).toMatchObject({ model: 'sonnet' });
      expect(r.title).toBe('Executing SDD-030');
    });

    it('rejects an invalid model id without running', async () => {
      await run({ model: 'bad model; rm -rf' });
      expect(mockRunnerExecute).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid model id'));
    });

    it('derives timeoutMs from complexity and applies the multiplier', async () => {
      vi.mocked(readAIConfig).mockResolvedValue(
        { permissionMode: 'default', provider: 'claude', model: 'sonnet', timeoutMultiplier: 2 } as never
      );
      expect((await run()).config?.timeoutMs).toBe(40 * 60_000);
    });

    it('reports the limit when the runner times out', async () => {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(makeSpecContent('ready')) as unknown as Uint8Array
      );
      vi.mocked(vscode.window.withProgress).mockImplementation(async (_o, task) =>
        task({ report: vi.fn() } as never, { onCancellationRequested: vi.fn(), isCancellationRequested: false } as never)
      );
      mockRunnerExecute.mockRejectedValue(new Error('Execution timed out'));
      await command({ kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' } as never);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Execution timed out after 20 minutes. Increase the execution timeout multiplier in AI Configuration.')
      );
    });

    it('changes nothing without options', async () => {
      const r = await run();
      expect(r.aiConfig).toMatchObject({ provider: 'claude', model: 'sonnet', permissionMode: 'dangerously-skip-permissions' });
      expect(r.config?.timeoutMs).toBe(20 * 60_000); // medium complexity
      expect(r.title).toBe('Executing SDD-030');
    });
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

  describe('interactive mode with no detected changes', () => {
    const item = { kind: 'spec' as const, filePath: '/workspace/.specs/SDD-030.sdd.md' };
    const record = { specId: 'SDD-030', executionNumber: 1 };

    function mockCapture(changedFiles: string[]) {
      vi.mocked(captureResults).mockResolvedValue({ record, logPath: 'x.log', changedFiles } as never);
    }
    function writtenStatuses(): string[] {
      return vi.mocked(vscode.workspace.fs.writeFile).mock.calls.map(
        (c) => /status: (\w+)/.exec(Buffer.from(c[1] as Uint8Array).toString('utf8'))?.[1] ?? ''
      );
    }

    beforeEach(() => {
      vi.mocked(readAIConfig).mockResolvedValue({ permissionMode: 'default', provider: 'claude' } as never);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(makeSpecContent('ready')) as unknown as Uint8Array
      );
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);
      mockRunnerExecute.mockResolvedValue({ success: true, output: 'ok', duration: 1 });
      vi.mocked(createCheckpoint).mockResolvedValue(undefined);
      vi.mocked(getLatestExecution).mockResolvedValue(undefined);
    });

    it('does not prompt and moves to review when changes are detected', async () => {
      mockCapture(['M src/foo.ts']);
      await command(item as never);
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(writtenStatuses().at(-1)).toBe('review');
    });

    it('moves to review when the user chooses Send to Review', async () => {
      mockCapture([]);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Send to Review' as never);
      await command(item as never);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'No file changes were detected for SDD-030. What would you like to do?',
        { modal: true },
        'Send to Review',
        'Back to Ready',
      );
      expect(writtenStatuses().at(-1)).toBe('review');
    });

    it('aborts the record and returns to ready on Back to Ready', async () => {
      mockCapture([]);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Back to Ready' as never);
      await command(item as never);
      expect(writtenStatuses().at(-1)).toBe('ready');
      expect(writtenStatuses()).not.toContain('review');
    });

    it('treats a dismissed dialog as Back to Ready', async () => {
      mockCapture([]);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);
      await command(item as never);
      expect(writtenStatuses().at(-1)).toBe('ready');
    });

    it('treats changes to only the spec file and .sdd/ as no changes', async () => {
      mockCapture(['M .specs/SDD-030.sdd.md', 'A .sdd/executions/SDD-030/exec-001.log']);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Back to Ready' as never);
      await command(item as never);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(writtenStatuses().at(-1)).toBe('ready');
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

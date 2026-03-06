import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
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
  getTestCommand: vi.fn().mockResolvedValue('npm test'),
  getAutoValidate: vi.fn().mockReturnValue(false),
}));

vi.mock('../execution/skillsLoader', () => ({
  loadSkills: vi.fn().mockResolvedValue(undefined),
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
import { createExecuteSpecCommand } from './executeSpec';
import { isCommandAvailable } from '../utils/shell';

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
budget_max_tokens: 100000
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

  it('shows warning notification on budget warning', async () => {
    // budget > 200_000 triggers a warning but is still valid
    const content = makeSpecContent('ready').replace('budget_max_tokens: 100000', 'budget_max_tokens: 250000');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(vscode.window.withProgress).mockResolvedValue(undefined);

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-030.sdd.md' };
    await command(item as never);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('budget warning')
    );
    expect(vscode.window.withProgress).toHaveBeenCalled();
  });
});

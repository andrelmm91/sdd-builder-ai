import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const files: Record<string, string> = {};
  const watcher = {
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  };
  const bulk = {
    addSpec: vi.fn(),
    removeSpec: vi.fn(),
    executeAll: vi.fn(),
    getQueue: vi.fn(() => ({ items: [], isRunning: false })),
    getFilePath: vi.fn(),
    clear: vi.fn(),
    cancel: vi.fn(),
    onStateChange: vi.fn(),
    listenerDispose: vi.fn(),
  };
  bulk.onStateChange.mockImplementation(() => ({ dispose: bulk.listenerDispose }));
  return {
    files,
    watcher,
    bulk,
    posted: [] as Array<{ type: string; data: unknown }>,
    handler: undefined as ((msg: { type: string; data?: unknown }) => Promise<void>) | undefined,
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/ws' } }] as unknown[] | undefined,
      createFileSystemWatcher: vi.fn(() => watcher),
      findFiles: vi.fn(async () => Object.keys(files).map((fsPath) => ({ fsPath }))),
      fs: {
        readFile: vi.fn(async (uri: { fsPath: string }) => {
          if (!(uri.fsPath in files)) throw new Error(`ENOENT ${uri.fsPath}`);
          return Buffer.from(files[uri.fsPath]);
        }),
        writeFile: vi.fn(async (uri: { fsPath: string }, bytes: Uint8Array) => {
          files[uri.fsPath] = Buffer.from(bytes).toString('utf8');
        }),
      },
    },
  };
});

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  RelativePattern: class {
    constructor(public base: unknown, public pattern: string) {}
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  workspace: h.workspace,
  window: { showErrorMessage: vi.fn(), showTextDocument: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../BaseWebviewPanel', () => ({
  BaseWebviewPanel: class {
    disposed = false;
    constructor() {
      h.handler = (msg) => (this as unknown as { handleMessage(m: unknown): Promise<void> }).handleMessage(msg);
    }
    reveal = vi.fn();
    protected post(type: string, data: unknown): void {
      h.posted.push({ type, data });
    }
    dispose(): void {
      this.disposed = true;
    }
  },
}));

vi.mock('../../../execution/bulkExecution', () => ({
  BulkExecutionManager: { getInstance: () => h.bulk },
}));
vi.mock('../../../commands/executeSpec', () => ({
  executeSingleSpec: vi.fn(),
  requireFullPermissionForBulk: vi.fn(),
  completeInteractiveSpec: vi.fn(),
  cancelCurrentSpec: vi.fn(),
  isInteractiveMode: vi.fn(),
}));
vi.mock('../../../execution/resultCapture', () => ({ getLatestExecution: vi.fn() }));
vi.mock('../../../commands/reviewCommands', () => ({ applyRequestChanges: vi.fn() }));
vi.mock('../../../config/aiConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/aiConfig')>()),
  readAIConfig: vi.fn(),
}));

import * as vscode from 'vscode';
import { KanbanPanel } from './KanbanPanel';
import {
  executeSingleSpec,
  requireFullPermissionForBulk,
  completeInteractiveSpec,
  cancelCurrentSpec,
  isInteractiveMode,
} from '../../../commands/executeSpec';
import { getLatestExecution } from '../../../execution/resultCapture';
import { applyRequestChanges } from '../../../commands/reviewCommands';
import { readAIConfig } from '../../../config/aiConfig';
import { DEFAULT_AI_CONFIG, type AIConfig } from '../../../config/aiConfigTypes';
import { BUILTIN_PROVIDERS } from '../../../config/providerTypes';

const executeCommand = vi.mocked(vscode.commands.executeCommand);

function specFile(id: string, status: string, extra = ''): string {
  return `---
spec_id: ${id}
title: Spec ${id}
status: ${status}
priority: medium
complexity: low
tags: [t]
relevant_files: [src/a.ts]
must_not_touch: []
depends_on: []
agent_skills: dev
created: 2026-01-01
---

## Context
ctx
${extra}
## Acceptance Criteria

### Automated
- [ ] auto ${id}

### Manual
- [ ] manual ${id}
`;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function open(): Promise<KanbanPanel> {
  KanbanPanel.createOrShow({ fsPath: '/ext' } as unknown as vscode.Uri);
  await flush();
  return (KanbanPanel as unknown as { instance: KanbanPanel }).instance;
}

function send(type: string, data?: unknown) {
  return h.handler!({ type, data });
}

function lastPosted<T = Record<string, unknown>>(type: string): T {
  return [...h.posted].reverse().find((m) => m.type === type)?.data as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  (KanbanPanel as unknown as { instance: unknown }).instance = undefined;
  h.posted.length = 0;
  for (const k of Object.keys(h.files)) delete h.files[k];
  h.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' } }];
  h.files['/ws/.specs/b.sdd.md'] = specFile('SDD-002', 'review');
  h.files['/ws/.specs/a.sdd.md'] = specFile('SDD-001', 'draft');
  h.files['/ws/.specs/broken.sdd.md'] = '---\ntitle: [x\n---\n';
  vi.mocked(readAIConfig).mockResolvedValue({ ...DEFAULT_AI_CONFIG } as AIConfig);
  vi.mocked(getLatestExecution).mockResolvedValue(undefined);
});

describe('KanbanPanel — lifecycle', () => {
  it('is a singleton that reveals on the second call', async () => {
    const panel = await open();
    KanbanPanel.createOrShow({ fsPath: '/ext' } as unknown as vscode.Uri);
    expect((KanbanPanel as unknown as { instance: KanbanPanel }).instance).toBe(panel);
    expect((panel as unknown as { reveal: ReturnType<typeof vi.fn> }).reveal).toHaveBeenCalledWith(1);
  });

  it('watches spec files and refreshes on create/change/delete', async () => {
    await open();
    expect(h.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: '.specs/**/*.sdd.md' })
    );
    h.posted.length = 0;
    h.watcher.onDidChange.mock.calls[0][0]();
    await flush();
    expect(lastPosted('specList')).toBeDefined();
  });

  it('forwards bulk state changes to the webview', async () => {
    await open();
    const listener = h.bulk.onStateChange.mock.calls[0][0] as (s: unknown) => void;
    listener({ items: [{ specId: 'SDD-001' }], isRunning: true });
    expect(lastPosted('bulkState')).toEqual({ items: [{ specId: 'SDD-001' }], isRunning: true });
  });

  it('dispose clears the singleton and disposes listeners', async () => {
    const panel = await open();
    panel.dispose();
    expect((KanbanPanel as unknown as { instance: unknown }).instance).toBeUndefined();
    expect(h.watcher.dispose).toHaveBeenCalledOnce();
    expect(h.bulk.listenerDispose).toHaveBeenCalledOnce();
  });

  it('posts an empty list without a workspace', async () => {
    h.workspace.workspaceFolders = undefined;
    await open();
    expect(h.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
    expect(lastPosted<{ specs: unknown[] }>('specList').specs).toEqual([]);
  });
});

describe('KanbanPanel — specList', () => {
  it('sends parsed specs sorted by ID, skipping unparseable files', async () => {
    await open();
    const { specs } = lastPosted<{ specs: Array<{ spec_id: string; automatedCriteria: string; manualCriteria: string }> }>('specList');
    expect(specs.map((s) => s.spec_id)).toEqual(['SDD-001', 'SDD-002']);
    expect(specs[0].automatedCriteria).toBe('- [ ] auto SDD-001');
    expect(specs[0].manualCriteria).toBe('- [ ] manual SDD-001');
  });

  it('adds changedFiles from the latest execution for review specs only', async () => {
    vi.mocked(getLatestExecution).mockResolvedValue({ changedFiles: ['M src/a.ts'] } as never);
    await open();
    const { specs } = lastPosted<{ specs: Array<{ spec_id: string; changedFiles?: string[] }> }>('specList');
    expect(getLatestExecution).toHaveBeenCalledExactlyOnceWith('SDD-002');
    expect(specs.find((s) => s.spec_id === 'SDD-002')!.changedFiles).toEqual(['M src/a.ts']);
    expect(specs.find((s) => s.spec_id === 'SDD-001')).not.toHaveProperty('changedFiles');
  });

  it.each([
    [{ provider: 'claude', permissionMode: 'default' }, false],
    [{ provider: 'claude', permissionMode: 'dangerously-skip-permissions' }, true],
    [{ provider: 'copilot', permissionMode: 'default' }, false],
    [{ provider: 'copilot', permissionMode: 'yolo' }, true],
  ])('isFullPermission for %o is %s', async (cfg, expected) => {
    vi.mocked(readAIConfig).mockResolvedValue({ ...DEFAULT_AI_CONFIG, ...cfg } as AIConfig);
    await open();
    expect(lastPosted('specList').isFullPermission).toBe(expected);
  });

  it('treats a custom provider batch mode as full permission', async () => {
    const aider = {
      id: 'aider', label: 'Aider', binary: 'aider', fileRefFormat: '{path}',
      batch: { args: ['--message', '{prompt}'] },
      permissionModes: [{ id: 'auto', label: 'Auto', mode: 'batch' }],
      models: ['gpt-4o'],
    };
    vi.mocked(readAIConfig).mockResolvedValue({
      ...DEFAULT_AI_CONFIG, provider: 'aider', permissionMode: 'auto', model: 'gpt-4o', customProviders: [aider],
    } as unknown as AIConfig);
    await open();
    expect(lastPosted('specList')).toMatchObject({
      isFullPermission: true,
      runModels: { providerLabel: 'Aider', defaultModel: 'gpt-4o', models: ['gpt-4o'] },
    });
  });

  it('reports the built-in provider models for the run-with-model menu', async () => {
    await open();
    const { runModels } = lastPosted<{ runModels: { providerLabel: string; models: string[] } }>('specList');
    const claude = BUILTIN_PROVIDERS.find((p) => p.id === 'claude')!;
    expect(runModels.providerLabel).toBe(claude.label);
    expect(runModels.models).toEqual(claude.models);
  });

  it('handles a missing AI config', async () => {
    vi.mocked(readAIConfig).mockResolvedValue(undefined as never);
    await open();
    expect(lastPosted('specList')).toMatchObject({
      isFullPermission: false,
      runModels: { providerLabel: '', defaultModel: '', models: [] },
    });
  });
});

describe('KanbanPanel — kanbanMove', () => {
  it('writes the new status for an allowed transition', async () => {
    await open();
    await send('kanbanMove', { specId: 'SDD-001', newStatus: 'ready' });
    expect(h.files['/ws/.specs/a.sdd.md']).toContain('status: ready');
    expect(lastPosted('moveError')).toBeUndefined();
  });

  it('rejects a disallowed transition without writing', async () => {
    await open();
    await send('kanbanMove', { specId: 'SDD-001', newStatus: 'done' });
    expect(h.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(lastPosted('moveError')).toEqual({ specId: 'SDD-001', message: "Cannot move SDD-001 from 'draft' to 'done'" });
  });

  it('reports an unknown spec', async () => {
    await open();
    await send('kanbanMove', { specId: 'SDD-404', newStatus: 'ready' });
    expect(lastPosted('moveError')).toEqual({ specId: 'SDD-404', message: 'Spec SDD-404 not found' });
  });

  it('reports read failures', async () => {
    await open();
    delete h.files['/ws/.specs/a.sdd.md'];
    await send('kanbanMove', { specId: 'SDD-001', newStatus: 'ready' });
    expect(lastPosted<{ message: string }>('moveError').message).toMatch(/ENOENT/);
  });
});

describe('KanbanPanel — cardAction', () => {
  it.each([
    ['markReady', 'sdd.markReady'],
    ['approve', 'sdd.approveSpec'],
    ['requestChanges', 'sdd.requestChanges'],
  ])('%s runs %s with the spec file path', async (action, command) => {
    await open();
    await send('cardAction', { action, specId: 'SDD-002' });
    expect(executeCommand).toHaveBeenCalledWith(command, '/ws/.specs/b.sdd.md');
  });

  it('reports an unknown spec', async () => {
    await open();
    await send('cardAction', { action: 'approve', specId: 'nope' });
    expect(lastPosted('moveError')).toEqual({ specId: 'nope', message: 'Spec file not found for nope' });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('ignores unknown actions', async () => {
    await open();
    await send('cardAction', { action: 'explode', specId: 'SDD-001' });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('execute passes the chosen model and brackets interactive runs', async () => {
    vi.mocked(isInteractiveMode).mockReturnValue(true);
    await open();
    executeCommand.mockImplementationOnce(async () => {
      expect(lastPosted('interactiveExecution')).toEqual({ specId: 'SDD-001' });
    });
    await send('cardAction', { action: 'execute', specId: 'SDD-001', model: 'opus' });
    expect(executeCommand).toHaveBeenCalledWith('sdd.executeSpec', '/ws/.specs/a.sdd.md', { model: 'opus' });
    expect(lastPosted('interactiveExecution')).toEqual({ specId: null });
  });

  it('execute clears the interactive marker even when the command throws', async () => {
    vi.mocked(isInteractiveMode).mockReturnValue(true);
    await open();
    executeCommand.mockRejectedValueOnce(new Error('fail'));
    await expect(send('cardAction', { action: 'execute', specId: 'SDD-001' })).rejects.toThrow('fail');
    expect(lastPosted('interactiveExecution')).toEqual({ specId: null });
  });

  it('execute in batch mode posts no interactive marker and no options', async () => {
    vi.mocked(isInteractiveMode).mockReturnValue(false);
    await open();
    await send('cardAction', { action: 'execute', specId: 'SDD-001' });
    expect(executeCommand).toHaveBeenCalledWith('sdd.executeSpec', '/ws/.specs/a.sdd.md', undefined);
    expect(lastPosted('interactiveExecution')).toBeUndefined();
  });
});

describe('KanbanPanel — bulk queue', () => {
  it('adds known specs with their file path and ignores unknown ones', async () => {
    await open();
    await send('addToBulk', { specId: 'SDD-001' });
    await send('addToBulk', { specId: 'nope' });
    expect(h.bulk.addSpec).toHaveBeenCalledExactlyOnceWith('SDD-001', '/ws/.specs/a.sdd.md');
  });

  it('removes, clears, cancels and reports the queue', async () => {
    await open();
    await send('removeFromBulk', { specId: 'SDD-001' });
    await send('clearBulk');
    await send('cancelBulk');
    await send('requestBulkState');
    expect(h.bulk.removeSpec).toHaveBeenCalledWith('SDD-001');
    expect(h.bulk.clear).toHaveBeenCalledOnce();
    expect(h.bulk.cancel).toHaveBeenCalledOnce();
    expect(lastPosted('bulkState')).toEqual({ items: [], isRunning: false });
  });

  it('executeAll does nothing without full permission', async () => {
    vi.mocked(requireFullPermissionForBulk).mockResolvedValue(false);
    await open();
    await send('executeAll');
    expect(h.bulk.executeAll).not.toHaveBeenCalled();
  });

  it('executeAll resolves file paths from the manager, then the board', async () => {
    vi.mocked(requireFullPermissionForBulk).mockResolvedValue(true);
    vi.mocked(executeSingleSpec).mockResolvedValue(true);
    h.bulk.getFilePath.mockImplementation((id: string) => (id === 'SDD-009' ? '/ws/.specs/nine.sdd.md' : undefined));
    await open();
    await send('executeAll');

    const executeFn = h.bulk.executeAll.mock.calls[0][0] as (id: string) => Promise<boolean>;
    await expect(executeFn('SDD-009')).resolves.toBe(true);
    expect(executeSingleSpec).toHaveBeenLastCalledWith('/ws/.specs/nine.sdd.md');
    await executeFn('SDD-001');
    expect(executeSingleSpec).toHaveBeenLastCalledWith('/ws/.specs/a.sdd.md');
    await expect(executeFn('unknown')).resolves.toBe(false);
    expect(executeSingleSpec).toHaveBeenCalledTimes(2);
  });
});

describe('KanbanPanel — other messages', () => {
  it('requestChanges applies feedback to the spec file', async () => {
    await open();
    await send('requestChanges', { specId: 'SDD-002', feedback: 'more tests' });
    await send('requestChanges', { specId: 'nope', feedback: 'x' });
    expect(applyRequestChanges).toHaveBeenCalledExactlyOnceWith('/ws/.specs/b.sdd.md', 'more tests');
  });

  it('requestChanges shows an error when applying fails', async () => {
    vi.mocked(applyRequestChanges).mockRejectedValueOnce(new Error('locked'));
    await open();
    await send('requestChanges', { specId: 'SDD-002', feedback: '' });
    expect(applyRequestChanges).toHaveBeenCalledWith('/ws/.specs/b.sdd.md', '');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Request changes failed: locked');
  });

  it('rejectSpec runs the command and always refreshes', async () => {
    await open();
    h.posted.length = 0;
    executeCommand.mockRejectedValueOnce(new Error('x'));
    await expect(send('rejectSpec', { specId: 'SDD-002' })).rejects.toThrow('x');
    expect(executeCommand).toHaveBeenCalledWith('sdd.rejectSpec', 'SDD-002');
    expect(lastPosted('specList')).toBeDefined();
  });

  it('opens a spec file, ignoring unknown IDs', async () => {
    await open();
    await send('openFile', { specId: 'SDD-001' });
    await send('openFile', { specId: 'nope' });
    expect(vscode.window.showTextDocument).toHaveBeenCalledExactlyOnceWith({ fsPath: '/ws/.specs/a.sdd.md' });
  });

  it('routes simple commands', async () => {
    await open();
    await send('openSpecForm');
    await send('openAiConfig');
    await send('completeInteractiveSpec');
    await send('cancelSpec');
    h.posted.length = 0;
    await send('refresh');
    expect(executeCommand).toHaveBeenCalledWith('sdd.newSpecForm');
    expect(executeCommand).toHaveBeenCalledWith('sdd.openAiConfig');
    expect(completeInteractiveSpec).toHaveBeenCalledOnce();
    expect(cancelCurrentSpec).toHaveBeenCalledOnce();
    expect(lastPosted('specList')).toBeDefined();
  });
});

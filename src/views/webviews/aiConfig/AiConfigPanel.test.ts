import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  window: {
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }] },
}));

const posted: Array<{ type: string; data: any }> = [];
let messageHandler: ((msg: { type: string; data: unknown }) => void) | undefined;

vi.mock('../BaseWebviewPanel', () => ({
  BaseWebviewPanel: class {
    protected panel = { dispose: vi.fn(), reveal: vi.fn() };
    constructor() {
      messageHandler = (msg) => void (this as any).handleMessage(msg);
    }
    reveal(): void {}
    protected post(type: string, data: unknown): void {
      posted.push({ type, data });
    }
    dispose(): void {}
  },
}));

vi.mock('../../../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  getWorkspaceRoot: vi.fn(() => '/workspace'),
  listFiles: vi.fn(async () => []),
}));
vi.mock('../../../utils/shell', () => ({ isCommandAvailable: vi.fn(async () => true) }));
vi.mock('../../../commands/initProject', () => ({ initProject: vi.fn() }));

import * as vscode from 'vscode';
import { AiConfigPanel } from './AiConfigPanel';
import { readWorkspaceFile, writeWorkspaceFile } from '../../../utils/fileSystem';
import { isCommandAvailable } from '../../../utils/shell';
import type { ProviderDefinition } from '../../../config/providerTypes';

const mockRead = vi.mocked(readWorkspaceFile);
const mockWrite = vi.mocked(writeWorkspaceFile);

const aider: ProviderDefinition = {
  id: 'aider',
  label: 'Aider',
  binary: 'aider',
  fileRefFormat: '{path}',
  batch: { args: ['--message', '{prompt}'] },
  modelArgs: ['--model', '{model}'],
  models: ['gpt-4o'],
  permissionModes: [{ id: 'auto', label: 'Auto', mode: 'batch' }],
};

function send(type: string, data: unknown = {}): Promise<void> {
  messageHandler!({ type, data });
  // handleMessage is async; let pending promises settle
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function last(type: string) {
  return [...posted].reverse().find((m) => m.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
  posted.length = 0;
  mockRead.mockResolvedValue(JSON.stringify({ ai: { customProviders: [aider] } }));
  (AiConfigPanel as any).instance = undefined;
  AiConfigPanel.createOrShow({ fsPath: '/ext' } as any);
});

describe('AiConfigPanel', () => {
  it('configData includes the raw custom providers', async () => {
    await send('requestConfig');
    const data = last('configData')!.data;
    expect(data.customProviders).toEqual([aider]);
    expect(data.providers.map((p: { id: string }) => p.id)).toEqual(['claude', 'copilot', 'aider']);
  });

  it('validateProvider returns field errors for an invalid definition', async () => {
    const bad = { ...aider, batch: { args: ['--message'] } };
    await send('validateProvider', { definition: bad, index: 0, all: [bad] });
    const res = last('providerValidation')!.data;
    expect(res.index).toBe(0);
    expect(res.errors).toEqual([{ path: 'batch.args', message: expect.stringContaining('{prompt}') }]);
    expect(res.previews).toEqual([]);
  });

  it('validateProvider scopes errors to the requested index', async () => {
    const bad = { ...aider, id: 'Bad' };
    await send('validateProvider', { definition: aider, index: 0, all: [aider, bad] });
    expect(last('providerValidation')!.data.errors).toEqual([]);
  });

  it('validateProvider returns one preview per permission mode for a valid definition', async () => {
    await send('validateProvider', { definition: aider, index: 0, all: [aider] });
    const res = last('providerValidation')!.data;
    expect(res.errors).toEqual([]);
    expect(res.binaryFound).toBe(true);
    expect(res.previews).toHaveLength(1);
    expect(res.previews[0].modeId).toBe('auto');
    expect(res.previews[0].command).toContain('aider --model gpt-4o --message');
    expect(res.previews[0].command).toContain('.sdd/executions/SDD-000/prompt.md');
  });

  it('caches the binary check per binary', async () => {
    await send('validateProvider', { definition: aider, index: 0, all: [aider] });
    await send('validateProvider', { definition: aider, index: 0, all: [aider] });
    expect(vi.mocked(isCommandAvailable)).toHaveBeenCalledTimes(1);
  });

  it('saveProviders posts providersSaved with the refreshed provider list', async () => {
    const added = { ...aider, id: 'aider-2', label: 'Aider 2' };
    let stored = JSON.stringify({ ai: { customProviders: [aider] } });
    mockRead.mockImplementation(async () => stored);
    mockWrite.mockImplementation(async (_p, content) => { stored = content; });

    await send('saveProviders', { providers: [aider, added] });

    const res = last('providersSaved')!.data;
    expect(res.customProviders.map((p: { id: string }) => p.id)).toEqual(['aider', 'aider-2']);
    expect(res.providers.map((p: { id: string }) => p.id)).toEqual(['claude', 'copilot', 'aider', 'aider-2']);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Custom providers saved.');
  });

  it('a rejected save posts providersSaveError and leaves the file unchanged', async () => {
    const bad = { ...aider, binary: 'has space' };
    await send('saveProviders', { providers: [bad] });
    expect(last('providersSaveError')!.data.message).toContain('Invalid provider definitions');
    expect(last('providersSaved')).toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});

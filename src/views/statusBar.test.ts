import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('vscode', () => {
  class RelativePattern {
    constructor(public base: unknown, public pattern: string) {}
  }

  const Uri = {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
  };

  const mockWatcher = {
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  };

  const mockStatusBarItem = {
    command: undefined as string | undefined,
    text: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };

  const StatusBarAlignment = { Left: 1, Right: 2 };

  const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/fake/workspace', toString: () => 'file:///fake/workspace' } }],
    createFileSystemWatcher: vi.fn(() => mockWatcher),
    findFiles: vi.fn(async () => []),
    fs: {
      readFile: vi.fn(),
    },
  };

  const window = {
    createStatusBarItem: vi.fn(() => mockStatusBarItem),
  };

  return {
    RelativePattern,
    Uri,
    StatusBarAlignment,
    workspace,
    window,
    _mockWatcher: mockWatcher,
    _mockStatusBarItem: mockStatusBarItem,
  };
});

import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import type { SpecData } from '../specs/types';

const makeSpec = (overrides: Partial<SpecData> & { spec_id: string; status: SpecData['status'] }): SpecData => ({
  title: 'Test Spec',
  priority: 'medium',
  complexity: 'low',
  tags: [],
  relevant_files: [],
  must_not_touch: [],
  depends_on: [],
  budget_max_tokens: 10000,
  agent_skills: 'frontend-dev',
  created: '2026-01-01',
  ...overrides,
});

const makeSddContent = (spec: SpecData): string => `---
spec_id: ${spec.spec_id}
title: ${spec.title}
status: ${spec.status}
priority: ${spec.priority}
complexity: ${spec.complexity}
tags: []
relevant_files: []
must_not_touch: []
depends_on: []
budget_max_tokens: ${spec.budget_max_tokens}
agent_skills: ${spec.agent_skills}
created: ${spec.created}
---

## Context

Test context.
`;

function setupFindFiles(specs: SpecData[]): void {
  const mockFs = vscode.workspace.fs as unknown as { readFile: ReturnType<typeof vi.fn> };
  const mockFindFiles = vscode.workspace.findFiles as ReturnType<typeof vi.fn>;

  const uris = specs.map((s) => ({ fsPath: `/fake/.specs/${s.spec_id}.sdd.md` }));
  mockFindFiles.mockResolvedValue(uris);

  const contentMap = new Map(specs.map((s) => [s.spec_id, Buffer.from(makeSddContent(s))]));
  mockFs.readFile.mockImplementation((uri: { fsPath: string }) => {
    const specId = uri.fsPath.replace('/fake/.specs/', '').replace('.sdd.md', '');
    return Promise.resolve(contentMap.get(specId) ?? Buffer.from(''));
  });
}

// Access mock internals
const mockVscode = vscode as unknown as {
  _mockStatusBarItem: { text: string; command: string | undefined; show: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  _mockWatcher: { onDidCreate: ReturnType<typeof vi.fn>; onDidChange: ReturnType<typeof vi.fn>; onDidDelete: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
};

describe('StatusBarManager', () => {
  let manager: StatusBarManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.useFakeTimers();
    manager = new StatusBarManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('creates a status bar item aligned to the left', () => {
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(vscode.StatusBarAlignment.Left);
  });

  it('sets the command to sdd.openDashboard', () => {
    expect(mockVscode._mockStatusBarItem.command).toBe('sdd.openDashboard');
  });

  it('shows the status bar item on construction', () => {
    expect(mockVscode._mockStatusBarItem.show).toHaveBeenCalled();
  });

  it('displays "0 ready, 0 running" when no specs exist', async () => {
    await manager.updateCounts();
    expect(mockVscode._mockStatusBarItem.text).toBe('SDD: 0 ready, 0 running');
  });

  it('counts ready specs correctly', async () => {
    setupFindFiles([
      makeSpec({ spec_id: 'SDD-001', status: 'ready' }),
      makeSpec({ spec_id: 'SDD-002', status: 'ready' }),
      makeSpec({ spec_id: 'SDD-003', status: 'draft' }),
    ]);
    await manager.updateCounts();
    expect(mockVscode._mockStatusBarItem.text).toBe('SDD: 2 ready, 0 running');
  });

  it('counts in_progress specs as running', async () => {
    setupFindFiles([
      makeSpec({ spec_id: 'SDD-001', status: 'in_progress' }),
      makeSpec({ spec_id: 'SDD-002', status: 'in_progress' }),
      makeSpec({ spec_id: 'SDD-003', status: 'ready' }),
    ]);
    await manager.updateCounts();
    expect(mockVscode._mockStatusBarItem.text).toBe('SDD: 1 ready, 2 running');
  });

  it('does not count done/draft/review specs', async () => {
    setupFindFiles([
      makeSpec({ spec_id: 'SDD-001', status: 'done' }),
      makeSpec({ spec_id: 'SDD-002', status: 'draft' }),
      makeSpec({ spec_id: 'SDD-003', status: 'review' }),
    ]);
    await manager.updateCounts();
    expect(mockVscode._mockStatusBarItem.text).toBe('SDD: 0 ready, 0 running');
  });

  it('registers file watcher for spec files', () => {
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    expect(mockVscode._mockWatcher.onDidCreate).toHaveBeenCalled();
    expect(mockVscode._mockWatcher.onDidChange).toHaveBeenCalled();
    expect(mockVscode._mockWatcher.onDidDelete).toHaveBeenCalled();
  });

  it('debounces file watcher updates (500ms)', async () => {
    const updateSpy = vi.spyOn(manager, 'updateCounts');

    // Simulate rapid file changes by calling scheduleUpdate via watcher callbacks
    const onDidChangeCallback = (mockVscode._mockWatcher.onDidChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as () => void;
    onDidChangeCallback();
    onDidChangeCallback();
    onDidChangeCallback();

    // Should not have triggered updateCounts yet (debounced)
    expect(updateSpy).not.toHaveBeenCalled();

    // Advance timer by 500ms
    await vi.advanceTimersByTimeAsync(500);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('disposes watcher and status bar item on dispose', () => {
    manager.dispose();
    expect(mockVscode._mockWatcher.dispose).toHaveBeenCalled();
    expect(mockVscode._mockStatusBarItem.dispose).toHaveBeenCalled();
  });

  it('shows "0 ready, 0 running" when workspace has no folders', async () => {
    const origFolders = vscode.workspace.workspaceFolders;
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: undefined, configurable: true });
    await manager.updateCounts();
    expect(mockVscode._mockStatusBarItem.text).toBe('SDD: 0 ready, 0 running');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: origFolders, configurable: true });
  });
});

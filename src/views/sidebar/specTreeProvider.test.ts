import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }

  class TreeItem {
    label: string;
    collapsibleState: number;
    contextValue?: string;
    tooltip?: string;
    iconPath?: unknown;
    command?: unknown;
    description?: string;
    constructor(label: string, collapsibleState = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(public id: string, public color?: unknown) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  class RelativePattern {
    constructor(public base: unknown, public pattern: string) {}
  }

  const Uri = {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
    parse: (s: string) => ({ scheme: s.split('://')[0], toString: () => s }),
  };

  const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

  const mockWatcher = {
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  };

  const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/fake/workspace', toString: () => 'file:///fake/workspace' } }],
    createFileSystemWatcher: vi.fn(() => mockWatcher),
    findFiles: vi.fn(async () => []),
    fs: {
      readFile: vi.fn(),
    },
  };

  return {
    EventEmitter,
    TreeItem,
    ThemeIcon,
    ThemeColor,
    RelativePattern,
    Uri,
    TreeItemCollapsibleState,
    workspace,
  };
});

import * as vscode from 'vscode';
import { SpecTreeProvider } from './specTreeProvider';
import { DashboardButtonItem, SpecGroupItem, SpecTreeItem } from './specTreeItem';
import type { SpecData } from '../../specs/types';

const makeSpec = (overrides: Partial<SpecData> & { spec_id: string; status: SpecData['status'] }): SpecData => ({
  title: 'Test Spec',
  priority: 'medium',
  complexity: 'low',
  tags: [],
  relevant_files: [],
  must_not_touch: [],
  depends_on: [],
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
tags: [${spec.tags.join(', ')}]
relevant_files: []
must_not_touch: []
depends_on: [${spec.depends_on.join(', ')}]
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

describe('SpecTreeProvider', () => {
  let provider: SpecTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    provider = new SpecTreeProvider();
  });

  describe('getChildren (root level)', () => {
    it('returns empty array when no specs exist', async () => {
      const children = await provider.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(DashboardButtonItem);
    });

    it('returns only status groups that have specs', async () => {
      setupFindFiles([
        makeSpec({ spec_id: 'SDD-001', status: 'draft' }),
        makeSpec({ spec_id: 'SDD-002', status: 'done' }),
      ]);

      const children = await provider.getChildren();
      expect(children).toHaveLength(3);
      expect(children[0]).toBeInstanceOf(DashboardButtonItem);
      expect(children[1]).toBeInstanceOf(SpecGroupItem);
      expect(children[2]).toBeInstanceOf(SpecGroupItem);

      const groups = children.slice(1) as SpecGroupItem[];
      expect(groups[0].status).toBe('draft');
      expect(groups[1].status).toBe('done');
    });

    it('shows correct spec count per group', async () => {
      setupFindFiles([
        makeSpec({ spec_id: 'SDD-001', status: 'draft' }),
        makeSpec({ spec_id: 'SDD-002', status: 'draft' }),
        makeSpec({ spec_id: 'SDD-003', status: 'ready' }),
      ]);

      const children = await provider.getChildren();
      const groups = children.filter((c) => c instanceof SpecGroupItem) as SpecGroupItem[];

      expect(groups[0].status).toBe('draft');
      expect(groups[0].label).toBe('Draft');
      expect(groups[0].description).toBe('(2)');
      expect(groups[1].status).toBe('ready');
      expect(groups[1].label).toBe('Ready');
      expect(groups[1].description).toBe('(1)');
    });

    it('returns groups in STATUS_ORDER order', async () => {
      setupFindFiles([
        makeSpec({ spec_id: 'SDD-003', status: 'done' }),
        makeSpec({ spec_id: 'SDD-001', status: 'in_progress' }),
        makeSpec({ spec_id: 'SDD-002', status: 'draft' }),
      ]);

      const children = await provider.getChildren();
      const statuses = children
        .filter((c) => c instanceof SpecGroupItem)
        .map((g) => (g as SpecGroupItem).status);
      expect(statuses).toEqual(['draft', 'in_progress', 'done']);
    });
  });

  describe('getChildren (group level)', () => {
    it('returns specs sorted by spec_id within a group', async () => {
      setupFindFiles([
        makeSpec({ spec_id: 'SDD-003', status: 'draft', title: 'C Spec' }),
        makeSpec({ spec_id: 'SDD-001', status: 'draft', title: 'A Spec' }),
        makeSpec({ spec_id: 'SDD-002', status: 'draft', title: 'B Spec' }),
      ]);

      // Load specs by calling getChildren at root first
      await provider.getChildren();

      const draftGroup = new SpecGroupItem('draft', 3);
      const specs = await provider.getChildren(draftGroup);
      const items = specs as SpecTreeItem[];

      expect(items).toHaveLength(3);
      expect(items[0].spec.spec_id).toBe('SDD-001');
      expect(items[1].spec.spec_id).toBe('SDD-002');
      expect(items[2].spec.spec_id).toBe('SDD-003');
    });

    it('returns only specs matching the requested status', async () => {
      setupFindFiles([
        makeSpec({ spec_id: 'SDD-001', status: 'draft' }),
        makeSpec({ spec_id: 'SDD-002', status: 'ready' }),
        makeSpec({ spec_id: 'SDD-003', status: 'draft' }),
      ]);

      await provider.getChildren();

      const draftGroup = new SpecGroupItem('draft', 2);
      const draftSpecs = await provider.getChildren(draftGroup);
      expect(draftSpecs).toHaveLength(2);
      (draftSpecs as SpecTreeItem[]).forEach((s) => expect(s.spec.status).toBe('draft'));

      const readyGroup = new SpecGroupItem('ready', 1);
      const readySpecs = await provider.getChildren(readyGroup);
      expect(readySpecs).toHaveLength(1);
      expect((readySpecs[0] as SpecTreeItem).spec.status).toBe('ready');
    });

    it('returns empty array for a SpecTreeItem (leaf node)', async () => {
      const spec = makeSpec({ spec_id: 'SDD-001', status: 'draft' });
      const leaf = new SpecTreeItem(spec, '/fake/.specs/SDD-001.sdd.md');
      const children = await provider.getChildren(leaf);
      expect(children).toHaveLength(0);
    });
  });

  describe('SpecTreeItem', () => {
    it('has correct label format', () => {
      const spec = makeSpec({ spec_id: 'SDD-042', status: 'ready', title: 'My Feature' });
      const item = new SpecTreeItem(spec, '/path/to/SDD-042.sdd.md');
      expect(item.label).toBe('SDD-042: My Feature');
    });

    it('has contextValue equal to the spec status', () => {
      const spec = makeSpec({ spec_id: 'SDD-001', status: 'in_progress' });
      const item = new SpecTreeItem(spec, '/path');
      expect(item.contextValue).toBe('in_progress');
    });

    it('includes complexity, tags and depends_on in tooltip', () => {
      const spec = makeSpec({
        spec_id: 'SDD-001',
        status: 'draft',
        complexity: 'high',
        tags: ['phase-1', 'backend'],
        depends_on: ['SDD-002', 'SDD-003'],
      });
      const item = new SpecTreeItem(spec, '/path');
      const tooltip = item.tooltip as string;
      expect(tooltip).toContain('Complexity: high');
      expect(tooltip).toContain('Tags: phase-1, backend');
      expect(tooltip).toContain('Depends on: SDD-002, SDD-003');
    });
  });

  describe('getTreeItem', () => {
    it('returns the element itself', () => {
      const spec = makeSpec({ spec_id: 'SDD-001', status: 'draft' });
      const item = new SpecTreeItem(spec, '/path');
      expect(provider.getTreeItem(item)).toBe(item);
    });
  });

  describe('refresh', () => {
    it('fires the onDidChangeTreeData event', () => {
      const mockFire = vi.fn();
      // Access private emitter via cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any)._onDidChangeTreeData.fire = mockFire;
      provider.refresh();
      expect(mockFire).toHaveBeenCalled();
    });
  });
});

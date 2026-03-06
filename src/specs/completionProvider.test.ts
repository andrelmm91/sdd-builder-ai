import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  CompletionItem: class {
    label: string;
    kind: number;
    detail?: string;
    constructor(label: string, kind: number) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: { File: 17 },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    findFiles: vi.fn(),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

import * as vscode from 'vscode';
import { SpecCompletionProvider } from './completionProvider';

function makeDocument(lines: string[], languageId = 'sdd-spec'): vscode.TextDocument {
  return {
    languageId,
    lineCount: lines.length,
    lineAt: (i: number) => ({ text: lines[i] }),
  } as unknown as vscode.TextDocument;
}

function makePosition(line: number, char = 5): vscode.Position {
  return { line, character: char } as vscode.Position;
}

describe('SpecCompletionProvider', () => {
  let provider: SpecCompletionProvider;

  beforeEach(() => {
    provider = new SpecCompletionProvider();
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      { fsPath: '/workspace/src/auth/login.ts' } as vscode.Uri,
      { fsPath: '/workspace/node_modules/pkg/index.js' } as vscode.Uri,
    ]);
  });

  it('returns completions when cursor is on a list item inside relevant_files', async () => {
    const lines = [
      'relevant_files:',
      '  - src/',
    ];
    const doc = makeDocument(lines);
    const pos = makePosition(1);
    const items = await provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(0);
    expect(items!.some((i: vscode.CompletionItem) => i.label === 'src/auth/login.ts')).toBe(true);
  });

  it('returns completions inside must_not_touch section', async () => {
    const lines = [
      'must_not_touch:',
      '  - ',
    ];
    const doc = makeDocument(lines);
    const items = await provider.provideCompletionItems(doc, makePosition(1));
    expect(items).toBeDefined();
  });

  it('returns undefined when not on a list item line', async () => {
    const lines = [
      'relevant_files:',
      '  src/auth/login.ts',
    ];
    const doc = makeDocument(lines);
    const items = await provider.provideCompletionItems(doc, makePosition(1));
    expect(items).toBeUndefined();
  });

  it('returns undefined when outside relevant_files or must_not_touch', async () => {
    const lines = [
      'title: My Spec',
      '  - some item',
    ];
    const doc = makeDocument(lines);
    const items = await provider.provideCompletionItems(doc, makePosition(1));
    expect(items).toBeUndefined();
  });

  it('returns undefined when workspace has no folders', async () => {
    vi.mocked(vscode.workspace).workspaceFolders = undefined as unknown as typeof vscode.workspace.workspaceFolders;
    const lines = ['relevant_files:', '  - '];
    const doc = makeDocument(lines);
    const items = await provider.provideCompletionItems(doc, makePosition(1));
    expect(items).toBeUndefined();
  });
});

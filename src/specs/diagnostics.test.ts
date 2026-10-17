import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type Handler = (arg: unknown) => void;

const h = vi.hoisted(() => {
  const handlers: Record<string, (arg: unknown) => void> = {};
  const listen = (name: string) => vi.fn((cb: (arg: unknown) => void) => {
    handlers[name] = cb;
    return { dispose: vi.fn() };
  });
  return {
    handlers,
    collection: { set: vi.fn(), delete: vi.fn(), dispose: vi.fn() },
    workspace: {
      textDocuments: [] as unknown[],
      onDidOpenTextDocument: listen('open'),
      onDidSaveTextDocument: listen('save'),
      onDidChangeTextDocument: listen('change'),
      onDidCloseTextDocument: listen('close'),
    },
  };
});

vi.mock('vscode', () => ({
  workspace: h.workspace,
  languages: { createDiagnosticCollection: vi.fn(() => h.collection) },
  Range: class {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  },
  Diagnostic: class {
    source?: string;
    constructor(public range: unknown, public message: string, public severity: number) {}
  },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
}));

import { SpecDiagnosticsProvider, activate } from './diagnostics';

interface Diag { range: { startLine: number; endChar: number }; message: string; severity: number; source?: string }

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n');

function makeDoc(fileName: string, text: string) {
  return { fileName, uri: { toString: () => `file://${fileName}`, fsPath: fileName }, getText: () => text };
}

function lastDiagnostics(): Diag[] {
  const calls = h.collection.set.mock.calls;
  return calls[calls.length - 1][1] as Diag[];
}

function fire(name: string, arg: unknown) {
  (h.handlers[name] as Handler)(arg);
}

let context: { subscriptions: unknown[] };

beforeEach(() => {
  vi.clearAllMocks();
  h.workspace.textDocuments = [];
  context = { subscriptions: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SpecDiagnosticsProvider', () => {
  it('registers listeners and pushes itself to the context subscriptions', () => {
    const provider = activate(context as never);
    expect(provider).toBeInstanceOf(SpecDiagnosticsProvider);
    expect(context.subscriptions).toContain(provider);
    expect(Object.keys(h.handlers).sort()).toEqual(['change', 'close', 'open', 'save']);
  });

  it('validates already-open .sdd.md documents on register, ignoring others', () => {
    h.workspace.textDocuments = [makeDoc('/a.sdd.md', fixture('sample-spec.sdd.md')), makeDoc('/b.ts', 'x')];
    activate(context as never);
    expect(h.collection.set).toHaveBeenCalledOnce();
    expect(h.collection.set).toHaveBeenCalledWith(expect.objectContaining({ fsPath: '/a.sdd.md' }), []);
  });

  it('sets an empty diagnostic list for a valid spec on open', () => {
    activate(context as never);
    fire('open', makeDoc('/a.sdd.md', fixture('sample-spec.sdd.md')));
    expect(lastDiagnostics()).toEqual([]);
  });

  it('ignores non-spec files on open and save', () => {
    activate(context as never);
    fire('open', makeDoc('/a.md', 'x'));
    fire('save', makeDoc('/a.sdd.md.bak', 'x'));
    expect(h.collection.set).not.toHaveBeenCalled();
  });

  it('maps validation errors to the frontmatter key and section heading lines', () => {
    activate(context as never);
    const text = fixture('invalid-spec.sdd.md');
    const lines = text.split('\n');
    fire('save', makeDoc('/bad.sdd.md', text));

    const diags = lastDiagnostics();
    const byMessage = (re: RegExp) => diags.find((d) => re.test(d.message))!;
    expect(diags.every((d) => d.source === 'sdd')).toBe(true);

    const priority = byMessage(/allowed values/);
    expect(lines[priority.range.startLine]).toMatch(/^(status|priority|complexity):/);

    const contextErr = byMessage(/Context section/);
    expect(lines[contextErr.range.startLine]).toBe('## Context');
    expect(contextErr.severity).toBe(0);
    expect(contextErr.range.endChar).toBe('## Context'.length);

    const functional = byMessage(/functional requirement/);
    expect(lines[functional.range.startLine]).toBe('### Functional');

    const constraintsWarn = byMessage(/constraints section/);
    expect(lines[constraintsWarn.range.startLine]).toBe('## Constraints');
    expect(constraintsWarn.severity).toBe(1);

    const created = byMessage(/must match pattern/);
    expect(lines[created.range.startLine]).toMatch(/^(spec_id|created):/);
  });

  it('falls back to line 0 when a section heading is absent', () => {
    activate(context as never);
    const text = fixture('sample-spec.sdd.md').replace(/## Constraints[\s\S]*?(?=## Examples)/, '');
    fire('save', makeDoc('/x.sdd.md', text));
    const warn = lastDiagnostics().find((d) => /constraints/.test(d.message))!;
    expect(warn.range.startLine).toBe(0);
    expect(warn.range.endChar).toBe(3);
  });

  it('reports parse errors at line 0 with Error severity', () => {
    activate(context as never);
    fire('open', makeDoc('/p.sdd.md', '---\ntitle: [oops\n---\n'));
    const diags = lastDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ severity: 0, source: 'sdd', range: { startLine: 0 } });
    expect(diags[0].message).toMatch(/YAML parse error/);
  });

  it('reports missing frontmatter fields as parse errors', () => {
    activate(context as never);
    fire('open', makeDoc('/p.sdd.md', '# no frontmatter'));
    expect(lastDiagnostics()).toHaveLength(11);
  });

  it('debounces change events per document', () => {
    vi.useFakeTimers();
    activate(context as never);
    const doc = makeDoc('/c.sdd.md', fixture('sample-spec.sdd.md'));
    const other = makeDoc('/d.sdd.md', fixture('sample-spec.sdd.md'));

    fire('change', { document: doc });
    vi.advanceTimersByTime(200);
    fire('change', { document: doc });
    fire('change', { document: other });
    vi.advanceTimersByTime(299);
    expect(h.collection.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.collection.set).toHaveBeenCalledTimes(2);
  });

  it('ignores change events for non-spec files', () => {
    vi.useFakeTimers();
    activate(context as never);
    fire('change', { document: makeDoc('/c.ts', '') });
    vi.runAllTimers();
    expect(h.collection.set).not.toHaveBeenCalled();
  });

  it('clears diagnostics and pending validation on close', () => {
    vi.useFakeTimers();
    activate(context as never);
    const doc = makeDoc('/c.sdd.md', fixture('sample-spec.sdd.md'));
    fire('change', { document: doc });
    fire('close', doc);
    vi.runAllTimers();
    expect(h.collection.delete).toHaveBeenCalledWith(doc.uri);
    expect(h.collection.set).not.toHaveBeenCalled();
  });

  it('dispose cancels timers and disposes subscriptions and collection', () => {
    vi.useFakeTimers();
    const provider = activate(context as never);
    fire('change', { document: makeDoc('/c.sdd.md', fixture('sample-spec.sdd.md')) });
    provider.dispose();
    vi.runAllTimers();
    expect(h.collection.set).not.toHaveBeenCalled();
    expect(h.collection.dispose).toHaveBeenCalledOnce();
    for (const listener of [h.workspace.onDidOpenTextDocument, h.workspace.onDidSaveTextDocument, h.workspace.onDidChangeTextDocument, h.workspace.onDidCloseTextDocument]) {
      expect(listener.mock.results[0].value.dispose).toHaveBeenCalledOnce();
    }
  });
});

import { vi } from 'vitest';
import type { SpecData, SpecDocument } from '../src/specs/types';
import type { ExecutionRecord } from '../src/execution/types';

// ---------------------------------------------------------------------------
// VS Code API mock — shared across all test files
// ---------------------------------------------------------------------------

vi.mock('vscode', () => {
  const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: 'file', path: p }),
    parse: (s: string) => ({ fsPath: s, scheme: 'file', path: s }),
    joinPath: (...parts: unknown[]) => ({ fsPath: (parts as string[]).join('/') }),
  };

  const mockDiagnosticCollection = {
    name: 'sdd',
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    forEach: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    dispose: vi.fn(),
    [Symbol.iterator]: function* () { /* noop */ },
  };

  return {
    Uri,
    Range: class {
      constructor(
        public startLine: number,
        public startChar: number,
        public endLine: number,
        public endChar: number,
      ) {}
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Diagnostic: class {
      constructor(
        public range: unknown,
        public message: string,
        public severity: number,
      ) {}
    },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItem: class {
      label: string;
      kind: number;
      detail?: string;
      constructor(label: string, kind: number) {
        this.label = label;
        this.kind = kind;
      }
    },
    CompletionItemKind: { File: 17, Text: 0, Keyword: 14 },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      getConfiguration: vi.fn(() => ({
        get: vi.fn(),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      })),
      findFiles: vi.fn().mockResolvedValue([]),
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        stat: vi.fn(),
      },
      createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    window: {
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        append: vi.fn(),
        show: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      })),
      createWebviewPanel: vi.fn(),
      withProgress: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn(),
    },
    languages: {
      createDiagnosticCollection: vi.fn(() => mockDiagnosticCollection),
      registerCompletionItemProvider: vi.fn(),
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
      dispose = vi.fn();
    },
    TreeItem: class {
      constructor(public label: string) {}
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ViewColumn: { One: 1, Two: 2, Three: 3 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Notification: 15, Window: 10 },
    ThemeIcon: class {
      constructor(public id: string) {}
    },
  };
});

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

export function createMockSpec(overrides: Partial<SpecData> = {}): SpecData {
  return {
    spec_id: 'SDD-001',
    title: 'Test spec',
    status: 'draft',
    priority: 'medium',
    complexity: 'low',
    tags: ['test'],
    relevant_files: ['src/foo.ts'],
    must_not_touch: [],
    depends_on: [],
    budget_max_tokens: 50000,
    agent_skills: 'backend-dev',
    created: '2026-01-01',
    ...overrides,
  };
}

export function createMockDocument(overrides: Partial<SpecDocument> = {}): SpecDocument {
  return {
    frontmatter: createMockSpec(overrides.frontmatter),
    context: 'Some context for the spec.',
    functionalRequirements: '- Implement feature X',
    nonFunctionalRequirements: '- Must be fast',
    automatedCriteria: '- [ ] Tests pass',
    manualCriteria: '',
    constraints: '- Must use TypeScript',
    examples: '',
    ...overrides,
  };
}

export function createMockExecutionRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    specId: 'SDD-001',
    executionNumber: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    tokensIn: 1000,
    tokensOut: 2000,
    cost: 0.05,
    status: 'completed',
    duration: 5000,
    testsPassed: true,
    prUrl: null,
    ...overrides,
  };
}

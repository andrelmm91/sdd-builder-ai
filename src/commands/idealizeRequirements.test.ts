import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('vscode', () => {
  const EventEmitter = class {
    private _listeners: ((data: unknown) => void)[] = [];
    get event() {
      return (listener: (data: unknown) => void) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data: unknown) {
      this._listeners.forEach((l) => l(data));
    }
    dispose() {
      this._listeners = [];
    }
  };

  return {
    EventEmitter,
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      // Simulate VS Code calling pty.open() when the terminal is created
      createTerminal: vi.fn().mockImplementation((opts: { pty?: { open: (dims: undefined) => void } }) => {
        if (opts.pty?.open) opts.pty.open(undefined);
        return { show: vi.fn(), dispose: vi.fn() };
      }),
    },
    workspace: {
      fs: {
        stat: vi.fn(),
        readDirectory: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
        createDirectory: vi.fn(),
      },
    },
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => p }),
      joinPath: (base: { fsPath: string }, ...parts: string[]) => {
        const joined = [base.fsPath, ...parts].join('/');
        return { fsPath: joined, toString: () => joined };
      },
    },
  };
});

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
}));

vi.mock('../config/extensionConfig', () => ({
  getClaudeCliBinary: vi.fn().mockReturnValue('claude'),
}));

vi.mock('../config/aiConfig', () => ({
  readAIConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn().mockResolvedValue({ success: true, stdout: '/usr/local/bin/claude', stderr: '', exitCode: 0 }),
}));

vi.mock('../execution/cliCommandBuilder', () => ({
  buildCliCommand: vi.fn().mockReturnValue('claude --model sonnet'),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn().mockReturnValue({ data: {}, body: '' }),
  serializeFrontmatter: vi.fn().mockReturnValue('---\nstatus: Idealization In Review\n---\n'),
}));

vi.mock('../views/webviews/requirementBoard/featureParser', () => ({
  updateFeatureStatus: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { execCommand } from '../utils/shell';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { idealizeRequirements } from './idealizeRequirements';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockExecCommand = vi.mocked(execCommand);
const mockSpawn = vi.mocked(cp.spawn);
const mockShowErrorMessage = vi.mocked(vscode.window.showErrorMessage);
const mockShowInformationMessage = vi.mocked(vscode.window.showInformationMessage);
const mockParseFrontmatter = vi.mocked(parseFrontmatter);
const mockSerializeFrontmatter = vi.mocked(serializeFrontmatter);
const mockUpdateFeatureStatus = vi.mocked(updateFeatureStatus);

const mockFs = vscode.workspace.fs as unknown as {
  stat: ReturnType<typeof vi.fn>;
  readDirectory: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
};

const FEATURE_NAME = 'MyFeature';
const FOLDER_PATH = '/workspace/.sdd/product/MyFeature';

/** Creates a mock ChildProcess that emits 'close' asynchronously via setTimeout(0). */
function makeChildProcessMock(exitCode = 0): cp.ChildProcess {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NodeEventEmitter = require('events').EventEmitter;
  const child = new NodeEventEmitter() as unknown as cp.ChildProcess;
  (child as unknown as Record<string, unknown>).stdout = new NodeEventEmitter();
  (child as unknown as Record<string, unknown>).stderr = new NodeEventEmitter();
  (child as unknown as Record<string, unknown>).kill = vi.fn();
  // Defer close so pty.open() can register listeners synchronously first
  setTimeout(() => child.emit('close', exitCode), 0);
  return child;
}

function setupHappyPathFs() {
  mockFs.stat.mockResolvedValue({});
  mockFs.readFile.mockResolvedValue(
    new TextEncoder().encode('---\nstatus: Idealization In Review\ndate: 2026-03-09\n---\n'),
  );
  mockParseFrontmatter.mockReturnValue({
    data: { status: 'Idealization In Review', date: '2026-03-09' },
    body: '',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('idealizeRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceRoot.mockReturnValue('/workspace');
    mockExecCommand.mockResolvedValue({ success: true, stdout: '/usr/local/bin/claude', stderr: '', exitCode: 0 });
    mockFs.createDirectory.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.delete.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockUpdateFeatureStatus.mockResolvedValue(undefined);
    // Re-apply createTerminal implementation after vi.clearAllMocks()
    vi.mocked(vscode.window.createTerminal).mockImplementation((opts: any) => {
      if (opts.pty?.open) opts.pty.open(undefined);
      return { show: vi.fn(), dispose: vi.fn() };
    });
  });

  // --- No workspace ---

  it('shows error and returns when no workspace is open', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('No workspace'));
    expect(mockExecCommand).not.toHaveBeenCalled();
  });

  // --- buildIdealizePrompt ---

  it('builds prompt with @ reference to feature file path', async () => {
    // Stop early (after writing prompt) to inspect written content
    mockExecCommand.mockResolvedValue({ success: false, stdout: '', stderr: '', exitCode: 1 });

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    const writeCalls = mockFs.writeFile.mock.calls;
    const promptCall = writeCalls.find((c) => {
      const uri = c[0] as { fsPath: string };
      return uri.fsPath.includes('idealize-');
    });
    expect(promptCall).toBeDefined();
    const promptContent = new TextDecoder().decode(promptCall![1] as Uint8Array);
    expect(promptContent).toContain(`@.sdd/product/${FEATURE_NAME}/${FEATURE_NAME}.md`);
    expect(promptContent).toContain('idealization.md');
  });

  // --- CLI not available ---

  it('shows error when CLI binary is not available', async () => {
    mockExecCommand.mockResolvedValue({ success: false, stdout: '', stderr: '', exitCode: 1 });

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('AI CLI not found'));
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  // --- CLI process fails ---

  it('shows error when CLI process exits with non-zero code', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(1));

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Idealization failed'));
  });

  // --- Post-validation: idealization.md exists with correct frontmatter ---

  it('reads and checks frontmatter when idealization.md already exists', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    setupHappyPathFs();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockParseFrontmatter).toHaveBeenCalled();
    // No rewrite needed — status and date are already correct
    const idealizationWrite = mockFs.writeFile.mock.calls.find((c) => {
      const uri = c[0] as { fsPath: string };
      return uri.fsPath.endsWith('idealization.md');
    });
    expect(idealizationWrite).toBeUndefined();
  });

  it('updates frontmatter when status is missing from idealization.md', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    mockFs.stat.mockResolvedValue({});
    mockFs.readFile.mockResolvedValue(new TextEncoder().encode('# Content\n'));
    mockParseFrontmatter.mockReturnValue({ data: {}, body: '# Content\n' });
    mockSerializeFrontmatter.mockReturnValue('---\nstatus: Idealization In Review\n---\n# Content\n');

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Idealization In Review' }),
      expect.any(String),
    );
    const idealizationWrite = mockFs.writeFile.mock.calls.find((c) => {
      const uri = c[0] as { fsPath: string };
      return uri.fsPath.endsWith('idealization.md');
    });
    expect(idealizationWrite).toBeDefined();
  });

  // --- Post-validation: rename fallback ---

  it('renames another .md file to idealization.md when idealization.md is missing', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    mockFs.stat.mockRejectedValue(new Error('not found'));
    mockFs.readDirectory.mockResolvedValue([['ai-output.md', 1]]);
    mockFs.readFile.mockResolvedValue(new TextEncoder().encode(''));
    mockParseFrontmatter.mockReturnValue({ data: {}, body: '' });

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockFs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining('ai-output.md') }),
      expect.objectContaining({ fsPath: expect.stringContaining('idealization.md') }),
      expect.any(Object),
    );
  });

  // --- Post-validation: no output file ---

  it('shows post-validation error when no output file exists', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    mockFs.stat.mockRejectedValue(new Error('not found'));
    mockFs.readDirectory.mockResolvedValue([[`${FEATURE_NAME}.md`, 1]]);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Post-validation failed'));
  });

  // --- Success path ---

  it('updates feature file status to "Idealization In Review" on success', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    setupHappyPathFs();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining(`${FEATURE_NAME}.md`) }),
      'Idealization In Review',
    );
  });

  it('shows success message on completion', async () => {
    mockSpawn.mockReturnValue(makeChildProcessMock(0));
    setupHappyPathFs();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Idealization complete'),
    );
  });
});


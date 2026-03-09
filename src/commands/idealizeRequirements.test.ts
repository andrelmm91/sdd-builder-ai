import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockProgressToken = {
  isCancellationRequested: false,
  onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      withProgress: vi.fn(async (_opts: unknown, task: (p: unknown, t: typeof mockProgressToken) => Promise<void>) => {
        await task({ report: vi.fn() }, mockProgressToken);
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
    ProgressLocation: { Notification: 15 },
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
  isCommandAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../execution/cliCommandBuilder', () => ({
  buildCliCommand: vi.fn().mockReturnValue('claude --print'),
}));

vi.mock('../execution/processSpawner', () => ({
  spawnWithCancellation: vi.fn().mockResolvedValue({ success: true }),
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
import { getWorkspaceRoot } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import { spawnWithCancellation } from '../execution/processSpawner';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { idealizeRequirements } from './idealizeRequirements';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockSpawnWithCancellation = vi.mocked(spawnWithCancellation);
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

function setupHappyPath() {
  // idealization.md exists
  mockFs.stat.mockResolvedValue({});
  // file has correct frontmatter
  mockFs.readFile.mockResolvedValue(new TextEncoder().encode('---\nstatus: Idealization In Review\n---\n'));
  mockParseFrontmatter.mockReturnValue({ data: { status: 'Idealization In Review', date: '2026-03-09' }, body: '' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('idealizeRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceRoot.mockReturnValue('/workspace');
    mockIsCommandAvailable.mockResolvedValue(true);
    mockSpawnWithCancellation.mockResolvedValue({ success: true });
    mockFs.createDirectory.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.delete.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockUpdateFeatureStatus.mockResolvedValue(undefined);
    mockProgressToken.isCancellationRequested = false;
    vi.mocked(vscode.window.withProgress).mockImplementation(
      async (_opts: unknown, task: (p: unknown, t: typeof mockProgressToken) => Promise<void>) => {
        await task({ report: vi.fn() }, mockProgressToken);
      }
    );
  });

  // --- No workspace ---

  it('shows error and returns when no workspace is open', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('No workspace'));
    expect(mockIsCommandAvailable).not.toHaveBeenCalled();
  });

  // --- buildIdealizePrompt ---

  it('builds prompt with @ reference to feature file path', async () => {
    setupHappyPath();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    // The prompt is written to a temp file via writeFile; find the call
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
    mockIsCommandAvailable.mockResolvedValue(false);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('AI CLI not found'));
    expect(mockSpawnWithCancellation).not.toHaveBeenCalled();
  });

  // --- CLI process fails ---

  it('shows error when CLI process fails', async () => {
    mockSpawnWithCancellation.mockResolvedValue({ success: false, error: 'process exited with code 1' });
    mockFs.stat.mockResolvedValue({});

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Idealization failed'));
    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('process exited with code 1'));
  });

  // --- Cancellation ---

  it('resolves without error when cancelled before CLI runs', async () => {
    vi.mocked(vscode.window.withProgress).mockImplementationOnce(
      async (_opts: unknown, task: (p: unknown, t: typeof mockProgressToken) => Promise<void>) => {
        const cancelledToken = { ...mockProgressToken, isCancellationRequested: true };
        await task({ report: vi.fn() }, cancelledToken);
      }
    );

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).not.toHaveBeenCalled();
    expect(mockSpawnWithCancellation).not.toHaveBeenCalled();
  });

  // --- Post-validation: idealization.md exists ---

  it('reads and checks frontmatter when idealization.md already exists', async () => {
    mockFs.stat.mockResolvedValue({});
    mockFs.readFile.mockResolvedValue(new TextEncoder().encode('---\nstatus: Idealization In Review\ndate: 2026-03-09\n---\n'));
    mockParseFrontmatter.mockReturnValue({ data: { status: 'Idealization In Review', date: '2026-03-09' }, body: '' });

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockParseFrontmatter).toHaveBeenCalled();
    // No rewrite needed since status and date already set
    const idealizationWrite = mockFs.writeFile.mock.calls.find((c) => {
      const uri = c[0] as { fsPath: string };
      return uri.fsPath.endsWith('idealization.md');
    });
    expect(idealizationWrite).toBeUndefined();
  });

  it('updates frontmatter when status is missing from idealization.md', async () => {
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
    // stat throws → file not found
    mockFs.stat.mockRejectedValue(new Error('not found'));
    mockFs.readDirectory.mockResolvedValue([
      ['ai-output.md', 1], // FileType.File = 1
    ]);
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

  it('throws post-validation error when no output file exists', async () => {
    mockFs.stat.mockRejectedValue(new Error('not found'));
    mockFs.readDirectory.mockResolvedValue([
      [`${FEATURE_NAME}.md`, 1], // only the feature file itself, no other .md
    ]);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Post-validation failed'));
  });

  // --- Success path ---

  it('updates feature file status to "Idealization In Review" on success', async () => {
    setupHappyPath();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining(`${FEATURE_NAME}.md`) }),
      'Idealization In Review',
    );
  });

  it('shows success message on completion', async () => {
    setupHappyPath();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Idealization complete'),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      createTerminal: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn(), sendText: vi.fn() })),
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
  readRequirementsAIConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/shell', () => ({
  isCommandAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../execution/cliCommandBuilder', () => ({
  buildCliCommand: vi.fn().mockReturnValue('claude --model sonnet'),
}));

// runInTerminal mock: calls onSuccess by default; configure via mockRunInTerminalMode
let mockRunInTerminalMode: 'success' | 'failure' | 'noop' = 'success';
vi.mock('../execution/processSpawner', () => ({
  runInTerminal: vi.fn(async (opts: { onSuccess?: () => Promise<void>; onFailure?: (code: number) => void }) => {
    if (mockRunInTerminalMode === 'success') {
      await opts.onSuccess?.();
    } else if (mockRunInTerminalMode === 'failure') {
      opts.onFailure?.(1);
    }
    // 'noop' mode: do nothing (for prompt-inspection tests)
  }),
}));

vi.mock('../execution/requirementsRunner', () => ({
  setActiveRequirementsTerminal: vi.fn(),
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
import { runInTerminal } from '../execution/processSpawner';
import { buildCliCommand } from '../execution/cliCommandBuilder';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { idealizeRequirements } from './idealizeRequirements';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockRunInTerminal = vi.mocked(runInTerminal);
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
    mockRunInTerminalMode = 'success';
    mockGetWorkspaceRoot.mockReturnValue('/workspace');
    mockIsCommandAvailable.mockResolvedValue(true);
    mockFs.createDirectory.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.delete.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockUpdateFeatureStatus.mockResolvedValue(undefined);
  });

  // --- No workspace ---

  it('shows error and returns when no workspace is open', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('No workspace'));
    expect(mockIsCommandAvailable).not.toHaveBeenCalled();
  });

  // --- builds prompt ---

  it('builds prompt with @ reference to feature file path', async () => {
    mockRunInTerminalMode = 'noop';

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(buildCliCommand).toHaveBeenCalled();
    const callArgs = vi.mocked(buildCliCommand).mock.calls[0][0];
    expect(callArgs.prompt).toContain(`@.sdd/product_requirements/${FEATURE_NAME}/${FEATURE_NAME}.md`);
    expect(callArgs.prompt).toContain('idealization.md');
  });

  // --- CLI not available ---

  it('shows error when CLI binary is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('AI CLI not found'));
    expect(mockRunInTerminal).not.toHaveBeenCalled();
  });

  // --- CLI process fails ---

  it('shows error when CLI process exits with non-zero code', async () => {
    mockRunInTerminalMode = 'failure';

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Idealization failed'));
  });

  // --- Post-validation: idealization.md exists with correct frontmatter ---

  it('reads and checks frontmatter when idealization.md already exists', async () => {
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
    mockFs.stat.mockRejectedValue(new Error('not found'));
    mockFs.readDirectory.mockResolvedValue([[`${FEATURE_NAME}.md`, 1]]);

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Post-validation failed'));
  });

  // --- Success path ---

  it('updates feature file status to "Idealization In Review" on success', async () => {
    setupHappyPathFs();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining(`${FEATURE_NAME}.md`) }),
      'Idealization In Review',
    );
  });

  it('shows success message on completion', async () => {
    setupHappyPathFs();

    await idealizeRequirements(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Idealization complete'),
    );
  });
});


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
        writeFile: vi.fn(),
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
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { createSddCards } from './createSddCards';
import { SPECS_FOLDER, IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockSpawnWithCancellation = vi.mocked(spawnWithCancellation);
const mockShowErrorMessage = vi.mocked(vscode.window.showErrorMessage);
const mockShowInformationMessage = vi.mocked(vscode.window.showInformationMessage);
const mockUpdateFeatureStatus = vi.mocked(updateFeatureStatus);

const mockFs = vscode.workspace.fs as unknown as {
  stat: ReturnType<typeof vi.fn>;
  readDirectory: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
};

const FEATURE_NAME = 'MyFeature';
const FOLDER_PATH = '/workspace/.sdd/product/MyFeature';

function setupNewSpecFiles(before: string[], after: string[]) {
  let callCount = 0;
  mockFs.readDirectory.mockImplementation(() => {
    callCount++;
    const files = callCount === 1 ? before : after;
    return Promise.resolve(files.map((name) => [name, 1]));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSddCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceRoot.mockReturnValue('/workspace');
    mockIsCommandAvailable.mockResolvedValue(true);
    mockSpawnWithCancellation.mockResolvedValue({ success: true });
    mockFs.createDirectory.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.delete.mockResolvedValue(undefined);
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

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('No workspace'));
    expect(mockIsCommandAvailable).not.toHaveBeenCalled();
  });

  // --- buildCreateSddCardsPrompt ---

  it('builds prompt referencing idealization.md path and SDD Planner skill', async () => {
    setupNewSpecFiles([], ['SDD-099-new-feature.sdd.md']);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    const writeCalls = mockFs.writeFile.mock.calls;
    const promptCall = writeCalls.find((c) => {
      const uri = c[0] as { fsPath: string };
      return uri.fsPath.includes('create-sdd-cards-');
    });
    expect(promptCall).toBeDefined();
    const promptContent = new TextDecoder().decode(promptCall![1] as Uint8Array);
    expect(promptContent).toContain(
      `@${PRODUCT_FOLDER}/${FEATURE_NAME}/${IDEALIZATION_FILENAME}`,
    );
    expect(promptContent).toContain('sdd-planner');
    expect(promptContent).toContain(`@${SPECS_FOLDER}/`);
  });

  // --- CLI not available ---

  it('shows error when CLI binary is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);
    mockFs.readDirectory.mockResolvedValue([]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('AI CLI not found'));
    expect(mockSpawnWithCancellation).not.toHaveBeenCalled();
  });

  // --- CLI process fails ---

  it('shows error when CLI process fails', async () => {
    mockFs.readDirectory.mockResolvedValue([]);
    mockSpawnWithCancellation.mockResolvedValue({ success: false, error: 'exit code 1' });

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('SDD card creation failed'),
    );
    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('exit code 1'));
  });

  // --- Cancellation ---

  it('resolves without error when cancelled before CLI runs', async () => {
    mockFs.readDirectory.mockResolvedValue([]);
    vi.mocked(vscode.window.withProgress).mockImplementationOnce(
      async (_opts: unknown, task: (p: unknown, t: typeof mockProgressToken) => Promise<void>) => {
        const cancelledToken = { ...mockProgressToken, isCancellationRequested: true };
        await task({ report: vi.fn() }, cancelledToken);
      }
    );

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).not.toHaveBeenCalled();
    expect(mockSpawnWithCancellation).not.toHaveBeenCalled();
  });

  // --- Spec file detection ---

  it('correctly identifies new spec files created by AI', async () => {
    const existing = ['SDD-001-old.sdd.md'];
    const newFile = 'SDD-099-new-feature.sdd.md';
    setupNewSpecFiles(existing, [...existing, newFile]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 spec file'),
    );
  });

  it('shows error when no new spec files were created', async () => {
    const existing = ['SDD-001-old.sdd.md'];
    setupNewSpecFiles(existing, existing); // no new files

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('No .sdd.md files were created'),
    );
    expect(mockUpdateFeatureStatus).not.toHaveBeenCalled();
  });

  it('shows pluralized message when multiple spec files are created', async () => {
    setupNewSpecFiles([], [
      'SDD-010-first.sdd.md',
      'SDD-011-second.sdd.md',
      'SDD-012-third.sdd.md',
    ]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('3 spec files'),
    );
  });

  // --- Status updates on success ---

  it('updates idealization.md status to "SDD Created" on success', async () => {
    setupNewSpecFiles([], ['SDD-099-new.sdd.md']);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining(IDEALIZATION_FILENAME) }),
      'SDD Created',
    );
  });

  it('updates feature file status to "SDD Created" on success', async () => {
    setupNewSpecFiles([], ['SDD-099-new.sdd.md']);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining(`${FEATURE_NAME}.md`) }),
      'SDD Created',
    );
  });

  it('updates both statuses on success', async () => {
    setupNewSpecFiles([], ['SDD-099-new.sdd.md']);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockUpdateFeatureStatus).toHaveBeenCalledTimes(2);
  });

  // --- Before/after snapshot ---

  it('takes spec file snapshot before AI call and compares after', async () => {
    const existingSpec = 'SDD-001-existing.sdd.md';
    let callCount = 0;
    mockFs.readDirectory.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([[existingSpec, 1]]);
      }
      return Promise.resolve([[existingSpec, 1], ['SDD-002-new.sdd.md', 1]]);
    });

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    // readDirectory called twice: once before AI, once after
    expect(mockFs.readDirectory).toHaveBeenCalledTimes(2);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 spec file'),
    );
  });
});

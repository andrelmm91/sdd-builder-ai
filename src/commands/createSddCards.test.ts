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
        writeFile: vi.fn(),
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
  buildCliCommand: vi.fn().mockReturnValue('claude --print some-prompt'),
}));

// runInTerminal mock: calls onSuccess by default; configure via mockRunInTerminalMode
let mockRunInTerminalMode: 'success' | 'failure' = 'success';
vi.mock('../execution/processSpawner', () => ({
  runInTerminal: vi.fn(async (opts: { onSuccess?: () => Promise<void>; onFailure?: (code: number) => void }) => {
    if (mockRunInTerminalMode === 'success') {
      await opts.onSuccess?.();
    } else {
      opts.onFailure?.(1);
    }
  }),
}));

vi.mock('../execution/requirementsRunner', () => ({
  setActiveRequirementsTerminal: vi.fn(),
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
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { createSddCards } from './createSddCards';
import { SPECS_FOLDER, IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockRunInTerminal = vi.mocked(runInTerminal);
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
    mockRunInTerminalMode = 'success';
    mockGetWorkspaceRoot.mockReturnValue('/workspace');
    mockIsCommandAvailable.mockResolvedValue(true);
    mockFs.createDirectory.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.delete.mockResolvedValue(undefined);
    mockUpdateFeatureStatus.mockResolvedValue(undefined);
  });

  // --- No workspace ---

  it('shows error and returns when no workspace is open', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('No workspace'));
    expect(mockIsCommandAvailable).not.toHaveBeenCalled();
  });

  // --- builds prompt ---

  it('builds prompt referencing idealization.md path and SDD Planner skill', async () => {
    setupNewSpecFiles([], ['SDD-099-new-feature.sdd.md']);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(buildCliCommand).toHaveBeenCalled();
    const callArgs = vi.mocked(buildCliCommand).mock.calls[0][0];
    expect(callArgs.prompt).toContain(`@${PRODUCT_FOLDER}/${FEATURE_NAME}/${IDEALIZATION_FILENAME}`);
    expect(callArgs.prompt).toContain('sdd-planner');
    expect(callArgs.prompt).toContain(`@${SPECS_FOLDER}/`);
  });

  // --- CLI not available ---

  it('shows error when CLI binary is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);
    mockFs.readDirectory.mockResolvedValue([]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('AI CLI not found'));
    expect(mockRunInTerminal).not.toHaveBeenCalled();
  });

  // --- CLI process fails ---

  it('shows error when CLI process fails', async () => {
    mockRunInTerminalMode = 'failure';
    mockFs.readDirectory.mockResolvedValue([]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('SDD card creation failed'),
    );
  });

  // --- Cancellation ---

  it('resolves without error when cancelled before CLI runs', async () => {
    // Simulate cancellation: mock runInTerminal to invoke the onTerminalReady and set cancelled=true,
    // then call onSuccess — the cancelled flag should suppress all messages.
    mockRunInTerminal.mockImplementationOnce(async (opts) => {
      // Capture and immediately invoke the cancel callback
      const mockTerminal = { show: vi.fn(), dispose: vi.fn(), sendText: vi.fn() };
      let cancelFn: (() => void) | undefined;
      const { setActiveRequirementsTerminal } = await import('../execution/requirementsRunner');
      vi.mocked(setActiveRequirementsTerminal).mockImplementationOnce((_t, cb) => {
        cancelFn = cb as (() => void) | undefined;
      });
      opts.onTerminalReady?.(mockTerminal as never);
      cancelFn?.();
      await opts.onSuccess?.();
    });

    mockFs.readDirectory.mockResolvedValue([]);

    await createSddCards(FEATURE_NAME, FOLDER_PATH);

    expect(mockShowErrorMessage).not.toHaveBeenCalled();
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


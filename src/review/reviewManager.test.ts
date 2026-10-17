import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  ViewColumn: { One: 1 },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/fileSystem', () => ({
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
}));

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
}));

vi.mock('../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn(),
  serializeFrontmatter: vi.fn(),
}));

const mockGetChangedFiles = vi.fn();
const mockOpenAllDiffs = vi.fn();

const mockGetLatestExecution = vi.fn();
const mockDiscard = vi.fn();

vi.mock('../execution/resultCapture', () => ({
  getLatestExecution: (...a: unknown[]) => mockGetLatestExecution(...a),
}));

vi.mock('../commands/reviewCommands', () => ({
  discardExecutionChanges: (...a: unknown[]) => mockDiscard(...a),
}));

vi.mock('./diffProvider', () => ({
  DiffProvider: class MockDiffProvider {
    getChangedFiles = mockGetChangedFiles;
    openAllDiffs = mockOpenAllDiffs;
    openDiffForFile = vi.fn().mockResolvedValue(undefined);
    getScopeViolations = vi.fn().mockResolvedValue([]);
  },
}));

import { ReviewManager } from './reviewManager';
import { listFiles, readWorkspaceFile, writeWorkspaceFile, getWorkspaceRoot } from '../utils/fileSystem';
import { execCommand } from '../utils/shell';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import * as vscode from 'vscode';

const mockListFiles = vi.mocked(listFiles);
const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockWriteWorkspaceFile = vi.mocked(writeWorkspaceFile);
const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockExecCommand = vi.mocked(execCommand);
const mockParseFrontmatter = vi.mocked(parseFrontmatter);
const mockSerializeFrontmatter = vi.mocked(serializeFrontmatter);
const mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage);

const SPEC_ID = 'SDD-031';
const SPEC_FILE_EXT = '.sdd.md';
const SPEC_RELATIVE_PATH = '.specs/SDD-031-review-types-manager.sdd.md';
const SPEC_CONTENT = '---\nspec_id: SDD-031\nstatus: review\n---\n## Context\n';

/**
 * Sets up common mocks for a single submitDecision call.
 * Uses mockImplementation (persistent) to avoid queue-bleed between tests.
 */
function setupSpecLookup() {
  // workspace root must be restored after vi.resetAllMocks() clears it
  mockGetWorkspaceRoot.mockReturnValue('/workspace');

  // listFiles: discriminate by pattern — spec globs return the spec file; review globs return empty
  mockListFiles.mockImplementation(async (pattern: string) => {
    if (pattern.includes(SPEC_FILE_EXT)) return [SPEC_RELATIVE_PATH];
    return [];
  });

  // readWorkspaceFile: always return spec content
  mockReadWorkspaceFile.mockResolvedValue(SPEC_CONTENT);

  // parseFrontmatter: return a fresh object each call so mutation in submitDecision is safe
  mockParseFrontmatter.mockImplementation(() => ({
    data: { spec_id: SPEC_ID, status: 'review' },
    body: '## Context\n',
  }));

  // serializeFrontmatter: return a stable string
  mockSerializeFrontmatter.mockReturnValue('---\nstatus: done\n---\n');

  // execCommand: default to returning git user name (handles git config & git checkout)
  mockExecCommand.mockResolvedValue({
    stdout: 'Test User\n',
    stderr: '',
    exitCode: 0,
    success: true,
  });
}

beforeEach(() => {
  // resetAllMocks clears call history AND flushes once-queues, preventing bleed between tests.
  vi.resetAllMocks();
  mockGetChangedFiles.mockResolvedValue([]);
  mockOpenAllDiffs.mockResolvedValue(undefined);
  mockWriteWorkspaceFile.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// submitDecision — approve
// ---------------------------------------------------------------------------

describe('ReviewManager.submitDecision — approve', () => {
  it('transitions spec status to "done"', async () => {
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'approve');

    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' }),
      expect.any(String)
    );
  });

  it('writes the updated spec file', async () => {
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'approve');

    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      SPEC_RELATIVE_PATH,
      expect.any(String)
    );
  });

  it('saves a review record with decision "approve"', async () => {
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'approve');

    const reviewWriteCall = mockWriteWorkspaceFile.mock.calls.find(([p]) =>
      (p as string).includes('/reviews/')
    );
    expect(reviewWriteCall).toBeDefined();
    const record = JSON.parse(reviewWriteCall![1] as string);
    expect(record.decision).toBe('approve');
    expect(record.specId).toBe(SPEC_ID);
    expect(record.reviewer).toBe('Test User');
  });
});

// ---------------------------------------------------------------------------
// submitDecision — request_changes
// ---------------------------------------------------------------------------

describe('ReviewManager.submitDecision — request_changes', () => {
  it('transitions spec status to "ready"', async () => {
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'request_changes', 'Please fix the tests.');

    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
      expect.any(String)
    );
  });

  it('saves feedback in the review record', async () => {
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'request_changes', 'Please fix the tests.');

    const reviewWriteCall = mockWriteWorkspaceFile.mock.calls.find(([p]) =>
      (p as string).includes('/reviews/')
    );
    expect(reviewWriteCall).toBeDefined();
    const record = JSON.parse(reviewWriteCall![1] as string);
    expect(record.decision).toBe('request_changes');
    expect(record.feedback).toBe('Please fix the tests.');
  });
});

// ---------------------------------------------------------------------------
// submitDecision — reject
// ---------------------------------------------------------------------------

describe('ReviewManager.submitDecision — reject', () => {
  const withCheckpoint = {
    checkpoint: { headSha: 'a', baseSha: 'a', untrackedBefore: [], createdAt: '' },
    changedFiles: ['M src/foo.ts', 'A src/bar.ts'],
  };

  it('discards with confirm:false after a single confirmation, then moves to draft', async () => {
    mockShowWarningMessage.mockResolvedValueOnce('Reject & Discard' as never);
    mockGetLatestExecution.mockResolvedValue(withCheckpoint);
    mockDiscard.mockResolvedValue(true);
    setupSpecLookup();

    await new ReviewManager().submitDecision(SPEC_ID, 'reject');

    expect(mockShowWarningMessage).toHaveBeenCalledTimes(1);
    expect(mockShowWarningMessage.mock.calls[0][0]).toBe(
      `Reject ${SPEC_ID} and discard 2 file change(s) made by the AI? This cannot be undone.`
    );
    expect(mockDiscard).toHaveBeenCalledWith(SPEC_ID, { confirm: false });
    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
      expect.any(String)
    );
  });

  it('no longer runs git checkout HEAD', async () => {
    mockShowWarningMessage.mockResolvedValueOnce('Reject & Discard' as never);
    mockGetLatestExecution.mockResolvedValue(withCheckpoint);
    setupSpecLookup();

    await new ReviewManager().submitDecision(SPEC_ID, 'reject');

    expect(mockExecCommand).not.toHaveBeenCalledWith(
      expect.stringContaining('git checkout'),
      expect.anything()
    );
  });

  it('does not discard or update spec when user cancels', async () => {
    mockShowWarningMessage.mockResolvedValueOnce(undefined as never);
    mockGetLatestExecution.mockResolvedValue(withCheckpoint);
    setupSpecLookup();

    await new ReviewManager().submitDecision(SPEC_ID, 'reject');

    expect(mockDiscard).not.toHaveBeenCalled();
    expect(mockSerializeFrontmatter).not.toHaveBeenCalled();
    expect(mockWriteWorkspaceFile).not.toHaveBeenCalled();
  });

  it('rejects without touching files when there is no checkpoint', async () => {
    mockShowWarningMessage.mockResolvedValueOnce('Reject' as never);
    mockGetLatestExecution.mockResolvedValue({ changedFiles: ['M src/foo.ts'] });
    setupSpecLookup();

    await new ReviewManager().submitDecision(SPEC_ID, 'reject');

    expect(mockShowWarningMessage.mock.calls[0][0]).toBe(
      `Reject ${SPEC_ID}? No checkpoint is available, so the AI's changes will be kept.`
    );
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
      expect.any(String)
    );
  });
});

// ---------------------------------------------------------------------------
// getReviewHistory
// ---------------------------------------------------------------------------

describe('ReviewManager.getReviewHistory', () => {
  it('returns review records sorted by reviewNumber', async () => {
    const record1 = JSON.stringify({
      specId: SPEC_ID,
      reviewNumber: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      decision: 'request_changes',
      feedback: 'Needs work',
      reviewer: 'alice',
    });
    const record2 = JSON.stringify({
      specId: SPEC_ID,
      reviewNumber: 2,
      timestamp: '2026-01-02T00:00:00.000Z',
      decision: 'approve',
      reviewer: 'bob',
    });

    mockListFiles.mockResolvedValue([
      `.sdd/reviews/${SPEC_ID}/review-002.json`,
      `.sdd/reviews/${SPEC_ID}/review-001.json`,
    ]);
    // files.sort() produces 001 first, then 002
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if ((path as string).includes('review-001')) return record1;
      if ((path as string).includes('review-002')) return record2;
      return undefined;
    });

    const manager = new ReviewManager();
    const history = await manager.getReviewHistory(SPEC_ID);

    expect(history).toHaveLength(2);
    expect(history[0].reviewNumber).toBe(1);
    expect(history[1].reviewNumber).toBe(2);
  });

  it('returns empty array when no reviews exist', async () => {
    mockListFiles.mockResolvedValue([]);

    const manager = new ReviewManager();
    const history = await manager.getReviewHistory(SPEC_ID);

    expect(history).toEqual([]);
  });
});

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
  it('transitions spec status to "draft" after confirmation', async () => {
    mockShowWarningMessage.mockResolvedValueOnce('Reject & Revert' as never);
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'reject');

    expect(mockSerializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
      expect.any(String)
    );
  });

  it('reverts changed files via git checkout', async () => {
    mockShowWarningMessage.mockResolvedValueOnce('Reject & Revert' as never);
    mockGetChangedFiles.mockResolvedValueOnce([
      { path: 'src/foo.ts', status: 'modified' },
      { path: 'src/bar.ts', status: 'added' },
    ]);
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'reject');

    expect(mockExecCommand).toHaveBeenCalledWith(
      expect.stringContaining('git checkout HEAD'),
      expect.any(Object)
    );
  });

  it('does not update spec when user cancels rejection', async () => {
    mockShowWarningMessage.mockResolvedValueOnce(undefined as never);
    setupSpecLookup();

    const manager = new ReviewManager();
    await manager.submitDecision(SPEC_ID, 'reject');

    expect(mockSerializeFrontmatter).not.toHaveBeenCalled();
    expect(mockWriteWorkspaceFile).not.toHaveBeenCalled();
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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
  isCommandAvailable: vi.fn(),
}));

vi.mock('../utils/fileSystem', () => ({
  writeWorkspaceFile: vi.fn(),
  readWorkspaceFile: vi.fn(),
  listFiles: vi.fn(),
  getWorkspaceRoot: vi.fn(),
}));

vi.mock('../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn(),
}));

import { captureResults, getExecutionHistory, getLatestExecution } from './resultCapture';
import { execCommand, isCommandAvailable } from '../utils/shell';
import { writeWorkspaceFile, readWorkspaceFile, listFiles, getWorkspaceRoot } from '../utils/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import type { ExecutionResult } from './types';

const mockExecCommand = vi.mocked(execCommand);
const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockWriteWorkspaceFile = vi.mocked(writeWorkspaceFile);
const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockListFiles = vi.mocked(listFiles);
const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);
const mockParseFrontmatter = vi.mocked(parseFrontmatter);

function makeExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    success: true,
    output: 'Claude output here',
    tokensIn: 1000,
    tokensOut: 500,
    duration: 12345,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspaceRoot.mockReturnValue('/workspace');
  mockIsCommandAvailable.mockResolvedValue(true);
  mockExecCommand.mockImplementation(async (cmd: string) => {
    if (cmd === 'git diff --name-status') {
      return { stdout: 'M\tsrc/foo.ts\nA\tsrc/bar.ts\n', stderr: '', exitCode: 0, success: true };
    }
    if (cmd === 'git diff') {
      return { stdout: 'diff content', stderr: '', exitCode: 0, success: true };
    }
    return { stdout: '', stderr: '', exitCode: 0, success: true };
  });
  mockListFiles.mockResolvedValue([]);
  mockWriteWorkspaceFile.mockResolvedValue(undefined);
  mockReadWorkspaceFile.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// captureResults
// ---------------------------------------------------------------------------

describe('captureResults', () => {
  it('returns a CaptureResult with the execution record, logPath, and changedFiles', async () => {
    const result = await captureResults('SDD-028', makeExecutionResult());

    expect(result).toHaveProperty('record');
    expect(result).toHaveProperty('logPath');
    expect(result).toHaveProperty('changedFiles');
  });

  it('execution record JSON is correctly structured', async () => {
    const executionResult = makeExecutionResult({ tokensIn: 2000, tokensOut: 800, duration: 5000 });
    const { record } = await captureResults('SDD-028', executionResult);

    expect(record.specId).toBe('SDD-028');
    expect(record.executionNumber).toBe(1);
    expect(typeof record.timestamp).toBe('string');
    expect(record.tokensIn).toBe(2000);
    expect(record.tokensOut).toBe(800);
    expect(record.status).toBe('completed');
    expect(record.duration).toBe(5000);
    expect(record.testsPassed).toBeNull();
    expect(record.prUrl).toBeNull();
  });

  it('sets status to "failed" when executionResult.success is false', async () => {
    const { record } = await captureResults('SDD-028', makeExecutionResult({ success: false }));
    expect(record.status).toBe('failed');
  });

  it('sets status to "completed" when executionResult.success is true', async () => {
    const { record } = await captureResults('SDD-028', makeExecutionResult({ success: true }));
    expect(record.status).toBe('completed');
  });

  it('captures changed files from git diff --name-status with type prefix', async () => {
    const { changedFiles } = await captureResults('SDD-028', makeExecutionResult());
    expect(changedFiles).toEqual(['M src/foo.ts', 'A src/bar.ts']);
  });

  it('writes changedFiles to the execution record JSON', async () => {
    await captureResults('SDD-028', makeExecutionResult());

    const jsonCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.json'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![1]);
    expect(parsed.changedFiles).toEqual(['M src/foo.ts', 'A src/bar.ts']);
  });

  it('detects scope violation when must_not_touch files are in changedFiles', async () => {
    // Set up spec file with must_not_touch including a file that is changed
    mockListFiles.mockImplementation(async (pattern: string) => {
      if (pattern.includes('.specs')) return ['.specs/SDD-028.sdd.md'];
      return [];
    });
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.specs/SDD-028.sdd.md') return 'spec-content';
      return undefined;
    });
    mockParseFrontmatter.mockReturnValue({
      data: { spec_id: 'SDD-028', must_not_touch: ['src/foo.ts'] },
      body: '',
    });

    await captureResults('SDD-028', makeExecutionResult());

    // Scope violation is logged, not stored on the record — verify it appears in the log
    const logCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.log'));
    expect(logCall).toBeDefined();
    expect(logCall![1]).toContain('VIOLATION DETECTED');
  });

  it('does not flag scope violation when no must_not_touch files were changed', async () => {
    mockListFiles.mockImplementation(async (pattern: string) => {
      if (pattern.includes('.specs')) return ['.specs/SDD-028.sdd.md'];
      return [];
    });
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.specs/SDD-028.sdd.md') return 'spec-content';
      return undefined;
    });
    mockParseFrontmatter.mockReturnValue({
      data: { spec_id: 'SDD-028', must_not_touch: ['src/untouched.ts'] },
      body: '',
    });

    await captureResults('SDD-028', makeExecutionResult());

    const logCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.log'));
    expect(logCall).toBeDefined();
    expect(logCall![1]).toContain('Scope OK  : ok');
  });

  it('does not flag scope violation when mustNotTouch is empty', async () => {
    await captureResults('SDD-028', makeExecutionResult());

    const logCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.log'));
    expect(logCall).toBeDefined();
    expect(logCall![1]).toContain('Scope OK  : ok');
  });

  it('writes the execution record JSON to the correct path', async () => {
    await captureResults('SDD-028', makeExecutionResult());

    const jsonCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.json'));
    expect(jsonCall).toBeDefined();
    expect(jsonCall![0]).toBe('.sdd/executions/SDD-028/exec-001.json');

    // Verify it is valid JSON containing the record
    const parsed = JSON.parse(jsonCall![1]);
    expect(parsed.specId).toBe('SDD-028');
  });

  it('writes the execution log to the correct path', async () => {
    await captureResults('SDD-028', makeExecutionResult());

    const logCall = mockWriteWorkspaceFile.mock.calls.find(([p]) => p.endsWith('.log'));
    expect(logCall).toBeDefined();
    expect(logCall![0]).toBe('.sdd/executions/SDD-028/exec-001.log');
  });

  it('execution numbering starts at 1 when no prior executions exist', async () => {
    mockListFiles.mockResolvedValue([]);
    const { record } = await captureResults('SDD-028', makeExecutionResult());
    expect(record.executionNumber).toBe(1);
  });

  it('execution numbering is sequential — increments past existing records', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-028/exec-001.json',
      '.sdd/executions/SDD-028/exec-002.json',
    ]);
    const { record } = await captureResults('SDD-028', makeExecutionResult());
    expect(record.executionNumber).toBe(3);
  });

  it('uses padded three-digit number in file paths', async () => {
    mockListFiles.mockResolvedValue([]);
    await captureResults('SDD-028', makeExecutionResult());

    const paths = mockWriteWorkspaceFile.mock.calls.map(([p]) => p);
    expect(paths.some((p) => p.includes('exec-001'))).toBe(true);
  });

  it('skips diff capture and logs warning when git is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { changedFiles } = await captureResults('SDD-028', makeExecutionResult());

    expect(changedFiles).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('git is not available'));
    consoleSpy.mockRestore();
  });

  it('skips diff capture when workspace root is unavailable', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { changedFiles } = await captureResults('SDD-028', makeExecutionResult());

    expect(changedFiles).toEqual([]);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getExecutionHistory
// ---------------------------------------------------------------------------

describe('getExecutionHistory', () => {
  it('returns an empty array when no execution records exist', async () => {
    mockListFiles.mockResolvedValue([]);
    const history = await getExecutionHistory('SDD-028');
    expect(history).toEqual([]);
  });

  it('returns execution records in ascending order by executionNumber', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-028/exec-002.json',
      '.sdd/executions/SDD-028/exec-001.json',
    ]);
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path.includes('exec-001')) {
        return JSON.stringify({ specId: 'SDD-028', executionNumber: 1 });
      }
      if (path.includes('exec-002')) {
        return JSON.stringify({ specId: 'SDD-028', executionNumber: 2 });
      }
      return undefined;
    });

    const history = await getExecutionHistory('SDD-028');
    expect(history).toHaveLength(2);
    expect(history[0].executionNumber).toBe(1);
    expect(history[1].executionNumber).toBe(2);
  });

  it('skips files with malformed JSON without throwing', async () => {
    mockListFiles.mockResolvedValue(['.sdd/executions/SDD-028/exec-001.json']);
    mockReadWorkspaceFile.mockResolvedValue('NOT VALID JSON{{');

    const history = await getExecutionHistory('SDD-028');
    expect(history).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getLatestExecution
// ---------------------------------------------------------------------------

describe('getLatestExecution', () => {
  it('returns undefined when no executions exist', async () => {
    mockListFiles.mockResolvedValue([]);
    const latest = await getLatestExecution('SDD-028');
    expect(latest).toBeUndefined();
  });

  it('returns the record with the highest executionNumber', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-028/exec-001.json',
      '.sdd/executions/SDD-028/exec-003.json',
      '.sdd/executions/SDD-028/exec-002.json',
    ]);
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      const match = /exec-0*(\d+)\.json/.exec(path);
      if (match) {
        return JSON.stringify({ specId: 'SDD-028', executionNumber: parseInt(match[1], 10) });
      }
      return undefined;
    });

    const latest = await getLatestExecution('SDD-028');
    expect(latest?.executionNumber).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fileSystem', () => ({
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
}));

import { getProjectCostSummary, getSpecCostHistory, getCostByTag } from './costTracker';
import { listFiles, readWorkspaceFile } from '../utils/fileSystem';

const mockListFiles = vi.mocked(listFiles);
const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);

function makeRecord(overrides: {
  specId?: string;
  executionNumber?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  timestamp?: string;
}) {
  return JSON.stringify({
    specId: overrides.specId ?? 'SDD-001',
    executionNumber: overrides.executionNumber ?? 1,
    timestamp: overrides.timestamp ?? '2026-01-01T00:00:00.000Z',
    tokensIn: overrides.tokensIn ?? 1000,
    tokensOut: overrides.tokensOut ?? 500,
    cost: overrides.cost ?? 0.01,
    status: 'completed',
    duration: 5000,
    testsPassed: true,
    prUrl: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getProjectCostSummary', () => {
  it('returns zero totals for empty project', async () => {
    mockListFiles.mockResolvedValue([]);

    const summary = await getProjectCostSummary();

    expect(summary.totalTokensIn).toBe(0);
    expect(summary.totalTokensOut).toBe(0);
    expect(summary.totalCost).toBe(0);
    expect(summary.specCount).toBe(0);
    expect(summary.averageCostPerSpec).toBe(0);
    expect(summary.executionCount).toBe(0);
  });

  it('aggregates multiple execution records correctly', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-001/exec-001.json',
      '.sdd/executions/SDD-001/exec-002.json',
      '.sdd/executions/SDD-002/exec-001.json',
    ]);
    mockReadWorkspaceFile
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-001', executionNumber: 1, tokensIn: 1000, tokensOut: 500, cost: 0.01 }))
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-001', executionNumber: 2, tokensIn: 2000, tokensOut: 800, cost: 0.02 }))
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-002', executionNumber: 1, tokensIn: 3000, tokensOut: 1000, cost: 0.03 }));

    const summary = await getProjectCostSummary();

    expect(summary.totalTokensIn).toBe(6000);
    expect(summary.totalTokensOut).toBe(2300);
    expect(summary.totalCost).toBeCloseTo(0.06);
    expect(summary.specCount).toBe(2);
    expect(summary.averageCostPerSpec).toBeCloseTo(0.03);
    expect(summary.executionCount).toBe(3);
  });

  it('skips malformed records', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-001/exec-001.json',
      '.sdd/executions/SDD-001/exec-002.json',
    ]);
    mockReadWorkspaceFile
      .mockResolvedValueOnce('not valid json {{{')
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-001', cost: 0.05 }));

    const summary = await getProjectCostSummary();

    expect(summary.executionCount).toBe(1);
    expect(summary.totalCost).toBeCloseTo(0.05);
  });
});

describe('getSpecCostHistory', () => {
  it('returns entries sorted by execution number', async () => {
    mockListFiles.mockResolvedValue([
      '.sdd/executions/SDD-001/exec-002.json',
      '.sdd/executions/SDD-001/exec-001.json',
    ]);
    mockReadWorkspaceFile
      .mockResolvedValueOnce(makeRecord({ executionNumber: 2, cost: 0.02, timestamp: '2026-01-02T00:00:00.000Z' }))
      .mockResolvedValueOnce(makeRecord({ executionNumber: 1, cost: 0.01, timestamp: '2026-01-01T00:00:00.000Z' }));

    const history = await getSpecCostHistory('SDD-001');

    expect(history).toHaveLength(2);
    expect(history[0].executionNumber).toBe(1);
    expect(history[1].executionNumber).toBe(2);
  });

  it('returns empty array when no executions exist', async () => {
    mockListFiles.mockResolvedValue([]);

    const history = await getSpecCostHistory('SDD-999');

    expect(history).toEqual([]);
  });
});

describe('getCostByTag', () => {
  it('sums cost for all specs matching the tag', async () => {
    // First listFiles call: spec files; subsequent calls: exec records per spec
    mockListFiles
      .mockResolvedValueOnce(['.specs/SDD-001-foo.sdd.md', '.specs/SDD-002-bar.sdd.md'])
      .mockResolvedValueOnce(['.sdd/executions/SDD-001/exec-001.json'])
      .mockResolvedValueOnce(['.sdd/executions/SDD-002/exec-001.json']);

    const specContent1 = `---\nspec_id: SDD-001\ntags: [phase-1, backend]\n---\n`;
    const specContent2 = `---\nspec_id: SDD-002\ntags: [phase-1, frontend]\n---\n`;

    mockReadWorkspaceFile
      .mockResolvedValueOnce(specContent1)
      .mockResolvedValueOnce(specContent2)
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-001', cost: 0.05 }))
      .mockResolvedValueOnce(makeRecord({ specId: 'SDD-002', cost: 0.03 }));

    const cost = await getCostByTag('phase-1');

    expect(cost).toBeCloseTo(0.08);
  });

  it('returns 0 when no specs have the tag', async () => {
    mockListFiles.mockResolvedValue(['.specs/SDD-001-foo.sdd.md']);
    mockReadWorkspaceFile.mockResolvedValueOnce(`---\nspec_id: SDD-001\ntags: [other]\n---\n`);

    const cost = await getCostByTag('phase-99');

    expect(cost).toBe(0);
  });
});

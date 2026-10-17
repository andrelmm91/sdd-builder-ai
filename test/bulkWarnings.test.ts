import { describe, it, expect } from 'vitest';
import { getBulkDependencyWarnings } from '../webview-ui/src/lib/bulkWarnings';

const spec = (spec_id: string, status: string, depends_on: string[] = []) => ({
  spec_id,
  status,
  depends_on,
});

describe('getBulkDependencyWarnings', () => {
  it('returns empty result when there are no dependencies', () => {
    const specs = [spec('A', 'ready'), spec('B', 'ready')];
    expect(getBulkDependencyWarnings(['A', 'B'], specs)).toEqual({});
  });

  it('does not warn when dependency is done and not queued', () => {
    const specs = [spec('A', 'done'), spec('B', 'ready', ['A'])];
    expect(getBulkDependencyWarnings(['B'], specs)).toEqual({});
  });

  it('does not warn when dependency is queued earlier', () => {
    const specs = [spec('A', 'ready'), spec('B', 'ready', ['A'])];
    expect(getBulkDependencyWarnings(['A', 'B'], specs)).toEqual({});
  });

  it('warns when dependency is queued later', () => {
    const specs = [spec('A', 'ready'), spec('B', 'ready', ['A'])];
    expect(getBulkDependencyWarnings(['B', 'A'], specs)).toEqual({
      B: ['A is queued after this spec'],
    });
  });

  it('warns when dependency is not done and not queued', () => {
    const specs = [spec('A', 'draft'), spec('B', 'ready', ['A'])];
    expect(getBulkDependencyWarnings(['B'], specs)).toEqual({
      B: ['A is not done (draft)'],
    });
  });

  it('warns when dependency is missing', () => {
    const specs = [spec('B', 'ready', ['X'])];
    expect(getBulkDependencyWarnings(['B'], specs)).toEqual({ B: ['X not found'] });
  });

  it('returns all messages for a spec with several problems', () => {
    const specs = [
      spec('A', 'ready'),
      spec('D', 'draft'),
      spec('B', 'ready', ['A', 'D', 'X']),
    ];
    expect(getBulkDependencyWarnings(['B', 'A'], specs)).toEqual({
      B: ['A is queued after this spec', 'D is not done (draft)', 'X not found'],
    });
  });
});

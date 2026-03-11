import { describe, it, expect } from 'vitest';
import { estimateScope, formatScopeEstimate } from './scopeEstimator';
import type { SpecData } from '../specs/types';

function makeSpec(overrides: Partial<SpecData> & { spec_id: string }): SpecData {
  return {
    title: 'Test spec',
    status: 'draft',
    priority: 'medium',
    complexity: 'medium',
    tags: [],
    relevant_files: [],
    must_not_touch: [],
    depends_on: [],
    budget_max_tokens: 100000,
    agent_skills: 'backend-dev',
    created: '2026-01-01',
    ...overrides,
  };
}

describe('estimateScope', () => {
  it('returns zero totals for empty spec list', () => {
    const estimate = estimateScope([]);
    expect(estimate.totalSpecs).toBe(0);
    expect(estimate.byComplexity).toEqual({ low: 0, medium: 0, high: 0 });
    expect(estimate.estimatedTotalTokens).toBe(0);
    expect(estimate.dependencyChainDepth).toBe(0);
    expect(estimate.byPhase).toEqual({});
    expect(estimate.byArea).toEqual({});
  });

  it('counts specs by complexity correctly', () => {
    const specs = [
      makeSpec({ spec_id: 'SDD-001', complexity: 'low' }),
      makeSpec({ spec_id: 'SDD-002', complexity: 'medium' }),
      makeSpec({ spec_id: 'SDD-003', complexity: 'high' }),
      makeSpec({ spec_id: 'SDD-004', complexity: 'high' }),
    ];

    const estimate = estimateScope(specs);

    expect(estimate.byComplexity.low).toBe(1);
    expect(estimate.byComplexity.medium).toBe(1);
    expect(estimate.byComplexity.high).toBe(2);
    expect(estimate.totalSpecs).toBe(4);
  });

  it('sums budget_max_tokens across all specs', () => {
    const specs = [
      makeSpec({ spec_id: 'SDD-001', budget_max_tokens: 50000 }),
      makeSpec({ spec_id: 'SDD-002', budget_max_tokens: 100000 }),
      makeSpec({ spec_id: 'SDD-003', budget_max_tokens: 150000 }),
    ];

    const estimate = estimateScope(specs);

    expect(estimate.estimatedTotalTokens).toBe(300000);
  });

  it('groups by phase tags correctly', () => {
    const specs = [
      makeSpec({ spec_id: 'SDD-001', tags: ['phase-1', 'backend'] }),
      makeSpec({ spec_id: 'SDD-002', tags: ['phase-1', 'frontend'] }),
      makeSpec({ spec_id: 'SDD-003', tags: ['phase-2', 'backend'] }),
    ];

    const estimate = estimateScope(specs);

    expect(estimate.byPhase['phase-1']).toBe(2);
    expect(estimate.byPhase['phase-2']).toBe(1);
    expect(estimate.byArea['backend']).toBe(2);
    expect(estimate.byArea['frontend']).toBe(1);
  });

  it('computes dependency chain depth correctly', () => {
    // SDD-001 → SDD-002 → SDD-003  (depth = 2)
    const specs = [
      makeSpec({ spec_id: 'SDD-001', depends_on: [] }),
      makeSpec({ spec_id: 'SDD-002', depends_on: ['SDD-001'] }),
      makeSpec({ spec_id: 'SDD-003', depends_on: ['SDD-002'] }),
    ];

    const estimate = estimateScope(specs);

    expect(estimate.dependencyChainDepth).toBe(2);
  });

  it('handles independent specs (chain depth = 0)', () => {
    const specs = [
      makeSpec({ spec_id: 'SDD-001' }),
      makeSpec({ spec_id: 'SDD-002' }),
    ];

    const estimate = estimateScope(specs);

    expect(estimate.dependencyChainDepth).toBe(0);
  });

});

describe('formatScopeEstimate', () => {
  it('returns a non-empty string with key fields', () => {
    const specs = [
      makeSpec({ spec_id: 'SDD-001', complexity: 'high', tags: ['phase-1'], budget_max_tokens: 100000 }),
    ];
    const estimate = estimateScope(specs);
    const formatted = formatScopeEstimate(estimate);

    expect(formatted).toContain('Total Specs');
    expect(formatted).toContain('Token Budget');
    expect(formatted).toContain('Chain Depth');
    expect(formatted).toContain('phase-1');
  });
});

import { describe, it, expect } from 'vitest';
import { validateDependencies, getExecutionOrder, getReadyToExecute, getDependencyChainDepth } from './dependencyResolver';
import type { SpecData } from '../specs/types';

function makeSpec(overrides: Partial<SpecData> & { spec_id: string }): SpecData {
  return {
    title: `Spec ${overrides.spec_id}`,
    status: 'ready',
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

describe('validateDependencies', () => {
  it('returns valid=true and no errors for specs with no dependencies', () => {
    const specs = [makeSpec({ spec_id: 'A' }), makeSpec({ spec_id: 'B' })];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=true for a valid linear dependency chain', () => {
    const specs = [
      makeSpec({ spec_id: 'A' }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', depends_on: ['B'] }),
    ];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects a self-reference', () => {
    const specs = [makeSpec({ spec_id: 'A', depends_on: ['A'] })];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.type === 'self_ref');
    expect(err).toBeDefined();
    expect(err!.specId).toBe('A');
  });

  it('detects a broken reference to a non-existent spec', () => {
    const specs = [makeSpec({ spec_id: 'A', depends_on: ['MISSING'] })];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.type === 'broken_ref');
    expect(err).toBeDefined();
    expect(err!.specId).toBe('A');
    expect(err!.message).toContain('MISSING');
  });

  it('detects a direct cycle between two specs', () => {
    const specs = [
      makeSpec({ spec_id: 'A', depends_on: ['B'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
    ];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(false);
    const cycleErrors = result.errors.filter((e) => e.type === 'cycle');
    expect(cycleErrors.length).toBeGreaterThan(0);
  });

  it('detects a longer cycle (A → B → C → A)', () => {
    const specs = [
      makeSpec({ spec_id: 'A', depends_on: ['C'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', depends_on: ['B'] }),
    ];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(false);
    expect(result.errors.filter((e) => e.type === 'cycle').length).toBeGreaterThan(0);
  });

  it('reports both broken_ref and cycle errors in the same result', () => {
    const specs = [
      makeSpec({ spec_id: 'A', depends_on: ['B', 'MISSING'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
    ];
    const result = validateDependencies(specs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'broken_ref')).toBe(true);
    expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
  });
});

describe('getExecutionOrder', () => {
  it('returns all spec IDs for independent specs', () => {
    const specs = [makeSpec({ spec_id: 'A' }), makeSpec({ spec_id: 'B' }), makeSpec({ spec_id: 'C' })];
    const order = getExecutionOrder(specs);
    expect(order.sort()).toEqual(['A', 'B', 'C']);
  });

  it('returns correct order for a linear dependency chain (deps first)', () => {
    const specs = [
      makeSpec({ spec_id: 'C', depends_on: ['B'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'A' }),
    ];
    const order = getExecutionOrder(specs);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('is deterministic — same input always produces same output', () => {
    const specs = [
      makeSpec({ spec_id: 'X' }),
      makeSpec({ spec_id: 'Y' }),
      makeSpec({ spec_id: 'Z', depends_on: ['X', 'Y'] }),
    ];
    expect(getExecutionOrder(specs)).toEqual(getExecutionOrder(specs));
  });

  it('includes all specs even when some form a cycle', () => {
    const specs = [
      makeSpec({ spec_id: 'A', depends_on: ['B'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C' }),
    ];
    const order = getExecutionOrder(specs);
    expect(order).toHaveLength(3);
    expect(order).toContain('A');
    expect(order).toContain('B');
    expect(order).toContain('C');
  });

  it('places independent spec before its dependents in a diamond graph', () => {
    // A → B, A → C, B → D, C → D
    const specs = [
      makeSpec({ spec_id: 'A' }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', depends_on: ['A'] }),
      makeSpec({ spec_id: 'D', depends_on: ['B', 'C'] }),
    ];
    const order = getExecutionOrder(specs);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });
});

describe('getReadyToExecute', () => {
  it('returns all non-done specs when there are no dependencies', () => {
    const specs = [
      makeSpec({ spec_id: 'A', status: 'ready' }),
      makeSpec({ spec_id: 'B', status: 'draft' }),
    ];
    const ready = getReadyToExecute(specs);
    expect(ready).toContain('A');
    expect(ready).toContain('B');
  });

  it('does not return done specs', () => {
    const specs = [makeSpec({ spec_id: 'A', status: 'done' })];
    expect(getReadyToExecute(specs)).not.toContain('A');
  });

  it('returns spec only when all its dependencies are done', () => {
    const specs = [
      makeSpec({ spec_id: 'A', status: 'done' }),
      makeSpec({ spec_id: 'B', status: 'ready', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', status: 'ready', depends_on: ['B'] }), // B not done yet
    ];
    const ready = getReadyToExecute(specs);
    expect(ready).toContain('B');
    expect(ready).not.toContain('C');
  });

  it('does not return a spec when some dependencies are not done', () => {
    const specs = [
      makeSpec({ spec_id: 'A', status: 'ready' }), // not done
      makeSpec({ spec_id: 'B', status: 'ready', depends_on: ['A'] }),
    ];
    expect(getReadyToExecute(specs)).not.toContain('B');
  });

  it('returns empty array when all specs are done', () => {
    const specs = [
      makeSpec({ spec_id: 'A', status: 'done' }),
      makeSpec({ spec_id: 'B', status: 'done' }),
    ];
    expect(getReadyToExecute(specs)).toHaveLength(0);
  });
});

describe('getDependencyChainDepth', () => {
  it('returns 0 for an empty array', () => {
    expect(getDependencyChainDepth([])).toBe(0);
  });

  it('returns 0 for specs with no dependencies', () => {
    const specs = [makeSpec({ spec_id: 'A' }), makeSpec({ spec_id: 'B' })];
    expect(getDependencyChainDepth(specs)).toBe(0);
  });

  it('returns 1 for a single dependency link', () => {
    const specs = [
      makeSpec({ spec_id: 'A' }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
    ];
    expect(getDependencyChainDepth(specs)).toBe(1);
  });

  it('returns correct depth for a linear chain of 4', () => {
    const specs = [
      makeSpec({ spec_id: 'A' }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', depends_on: ['B'] }),
      makeSpec({ spec_id: 'D', depends_on: ['C'] }),
    ];
    expect(getDependencyChainDepth(specs)).toBe(3);
  });

  it('returns the longest chain in a branching graph', () => {
    // A (depth 0), B→A (depth 1), C→B (depth 2), D→A (depth 1)
    const specs = [
      makeSpec({ spec_id: 'A' }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
      makeSpec({ spec_id: 'C', depends_on: ['B'] }),
      makeSpec({ spec_id: 'D', depends_on: ['A'] }),
    ];
    expect(getDependencyChainDepth(specs)).toBe(2);
  });

  it('does not infinite-loop on cycles', () => {
    const specs = [
      makeSpec({ spec_id: 'A', depends_on: ['B'] }),
      makeSpec({ spec_id: 'B', depends_on: ['A'] }),
    ];
    // Should complete without hanging; exact value doesn't matter
    expect(() => getDependencyChainDepth(specs)).not.toThrow();
  });
});

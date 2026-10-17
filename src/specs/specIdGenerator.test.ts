import { describe, it, expect } from 'vitest';
import { parseSpecId, getNextSpecId, generateBatchIds } from './specIdGenerator';

describe('parseSpecId', () => {
  it('parses prefix and number', () => {
    expect(parseSpecId('SDD-001')).toEqual({ prefix: 'SDD', number: 1 });
    expect(parseSpecId('Feat2-1234')).toEqual({ prefix: 'Feat2', number: 1234 });
  });

  it.each(['', 'SDD', 'SDD-', '001', '1SDD-001', 'SDD-001-x', 'SDD_001', ' SDD-001'])(
    'returns null for %j',
    (id) => {
      expect(parseSpecId(id)).toBeNull();
    }
  );
});

describe('getNextSpecId', () => {
  it('starts at 001 when no IDs exist', () => {
    expect(getNextSpecId([], 'SDD')).toBe('SDD-001');
  });

  it('uses max + 1 and skips gaps', () => {
    expect(getNextSpecId(['SDD-001', 'SDD-007', 'SDD-003'], 'SDD')).toBe('SDD-008');
  });

  it('ignores other prefixes (case-sensitive) and unparseable IDs', () => {
    expect(getNextSpecId(['OTHER-050', 'sdd-020', 'garbage', 'SDD-002'], 'SDD')).toBe('SDD-003');
  });

  it('grows past three digits', () => {
    expect(getNextSpecId(['SDD-999'], 'SDD')).toBe('SDD-1000');
  });
});

describe('generateBatchIds', () => {
  it('generates sequential IDs after the current max', () => {
    expect(generateBatchIds(3, ['SDD-010', 'X-099'], 'SDD')).toEqual(['SDD-011', 'SDD-012', 'SDD-013']);
  });

  it('starts at 001 for a new prefix', () => {
    expect(generateBatchIds(2, ['SDD-010'], 'NEW')).toEqual(['NEW-001', 'NEW-002']);
  });

  it('returns an empty list for count 0', () => {
    expect(generateBatchIds(0, [], 'SDD')).toEqual([]);
  });

  it('agrees with getNextSpecId for the first ID', () => {
    const existing = ['SDD-004', 'SDD-002'];
    expect(generateBatchIds(1, existing, 'SDD')[0]).toBe(getNextSpecId(existing, 'SDD'));
  });
});

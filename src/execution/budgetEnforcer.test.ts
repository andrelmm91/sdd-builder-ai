import { describe, it, expect } from 'vitest';
import {
  validateBudget,
  checkBudgetExceeded,
  formatTokenCount,
  getBudgetForComplexity,
} from './budgetEnforcer';

describe('validateBudget', () => {
  it('returns invalid when budget is below minimum (10000)', () => {
    const result = validateBudget(5000);
    expect(result.valid).toBe(false);
    expect(result.warning).toMatch(/below minimum/i);
  });

  it('returns invalid when budget is exactly below minimum', () => {
    expect(validateBudget(9999).valid).toBe(false);
  });

  it('returns valid for the minimum boundary', () => {
    expect(validateBudget(10000).valid).toBe(true);
  });

  it('returns invalid when budget exceeds maximum (500000)', () => {
    const result = validateBudget(600000);
    expect(result.valid).toBe(false);
    expect(result.warning).toMatch(/exceeds maximum/i);
  });

  it('returns valid with warning when budget is above 200000', () => {
    const result = validateBudget(250000);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/recommended threshold/i);
  });

  it('returns valid with no warning for a normal budget', () => {
    const result = validateBudget(100000);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns valid with no warning at exactly 200000', () => {
    const result = validateBudget(200000);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe('checkBudgetExceeded', () => {
  it('returns false when tokens used are within budget', () => {
    expect(checkBudgetExceeded(100000, 80000)).toBe(false);
  });

  it('returns false when tokens used equal the budget', () => {
    expect(checkBudgetExceeded(100000, 100000)).toBe(false);
  });

  it('returns true when tokens used exceed budget', () => {
    expect(checkBudgetExceeded(100000, 100001)).toBe(true);
  });
});

describe('formatTokenCount', () => {
  it('formats numbers below 1000 as plain integers', () => {
    expect(formatTokenCount(500)).toBe('500');
  });

  it('formats thousands as K', () => {
    expect(formatTokenCount(100_000)).toBe('100K');
  });

  it('formats with decimal for non-round thousands', () => {
    expect(formatTokenCount(1_200)).toBe('1.2K');
  });

  it('formats millions as M', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M');
  });

  it('formats 1.2M correctly', () => {
    expect(formatTokenCount(1_200_000)).toBe('1.2M');
  });
});

describe('getBudgetForComplexity', () => {
  it('returns 50000 for low complexity', () => {
    expect(getBudgetForComplexity('low')).toBe(50_000);
  });

  it('returns 100000 for medium complexity', () => {
    expect(getBudgetForComplexity('medium')).toBe(100_000);
  });

  it('returns 150000 for high complexity', () => {
    expect(getBudgetForComplexity('high')).toBe(150_000);
  });
});

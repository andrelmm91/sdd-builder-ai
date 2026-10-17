import { describe, it, expect } from 'vitest';
import { canTransition, getValidTransitions } from './lifecycle';

describe('lifecycle', () => {
  it('allows in_progress → ready (stale recovery)', () => {
    expect(canTransition('in_progress', 'ready')).toBe(true);
  });

  it('still allows in_progress → review', () => {
    expect(canTransition('in_progress', 'review')).toBe(true);
  });

  it('rejects in_progress → done', () => {
    expect(canTransition('in_progress', 'done')).toBe(false);
    expect(getValidTransitions('in_progress')).toEqual(['review', 'ready']);
  });
});

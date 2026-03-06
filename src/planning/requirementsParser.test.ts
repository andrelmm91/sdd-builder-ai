import { describe, it, expect } from 'vitest';
import { parseRequirements } from './requirementsParser';
import { validateRequirements } from './requirementsParser';
import type { RequirementsInput } from './types';

function input(rawText: string, source: RequirementsInput['source'] = 'freetext'): RequirementsInput {
  return { rawText, source };
}

describe('parseRequirements', () => {
  it('trims leading and trailing whitespace', () => {
    expect(parseRequirements(input('  hello world  '))).toBe('hello world');
  });

  it('collapses three or more consecutive blank lines into one blank line', () => {
    const raw = 'first\n\n\n\nsecond';
    expect(parseRequirements(input(raw))).toBe('first\n\nsecond');
  });

  it('leaves a single blank line untouched', () => {
    const raw = 'first\n\nsecond';
    expect(parseRequirements(input(raw))).toBe('first\n\nsecond');
  });

  it('strips null bytes', () => {
    expect(parseRequirements(input('hel\x00lo'))).toBe('hello');
  });

  it('strips lone surrogate characters', () => {
    const withSurrogate = 'hel\uD800lo';
    expect(parseRequirements(input(withSurrogate))).toBe('hello');
  });

  it('handles clipboard source the same as freetext', () => {
    expect(parseRequirements(input('  text  ', 'clipboard'))).toBe('text');
  });
});

describe('validateRequirements', () => {
  it('rejects empty string', () => {
    const result = validateRequirements('');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects whitespace-only string', () => {
    const result = validateRequirements('   ');
    expect(result.valid).toBe(false);
  });

  it('rejects text shorter than 20 characters', () => {
    const result = validateRequirements('too short');
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/too short/i);
  });

  it('accepts text that meets the minimum length', () => {
    const result = validateRequirements('This is a valid requirement text.');
    expect(result.valid).toBe(true);
  });

  it('warns but still returns valid for text longer than 5000 chars', () => {
    const long = 'a'.repeat(5001);
    const result = validateRequirements(long);
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toMatch(/long/i);
  });

  it('returns no issues for normal valid text', () => {
    const result = validateRequirements('Add a user authentication system with OAuth2 support.');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { quoteBash, quotePowerShell, quoteForShell } from './shellQuote';

describe('quoteBash', () => {
  it.each([
    ['plain', "'plain'"],
    ["it's", "'it'\\''s'"],
    ['say "hi"', `'say "hi"'`],
    ['$HOME', "'$HOME'"],
    ['a`b`', "'a`b`'"],
    ['a\nb', "'a\nb'"],
  ])('quotes %j', (input, expected) => {
    expect(quoteBash(input)).toBe(expected);
  });
});

describe('quotePowerShell', () => {
  it.each([
    ['plain', "'plain'"],
    ["it's", "'it''s'"],
    ['say "hi"', `'say \\"hi\\"'`],
    ['$HOME', "'$HOME'"],
    ['a`b`', "'a`b`'"],
    ['a\nb', "'a\nb'"],
  ])('quotes %j', (input, expected) => {
    expect(quotePowerShell(input)).toBe(expected);
  });
});

describe('quoteForShell', () => {
  it('uses PowerShell quoting on win32', () => {
    expect(quoteForShell("it's", 'win32')).toBe("'it''s'");
    expect(quoteForShell('say "hi"', 'win32')).toBe(`'say \\"hi\\"'`);
  });

  it.each(['linux', 'darwin'] as const)('uses bash quoting on %s', (platform) => {
    expect(quoteForShell("it's", platform)).toBe("'it'\\''s'");
    expect(quoteForShell('$x `y` "z"\n', platform)).toBe("'$x `y` \"z\"\n'");
  });
});

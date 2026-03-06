import type { RequirementsInput } from './types';

const MIN_LENGTH = 20;
const MAX_LENGTH = 5000;

/**
 * Normalizes requirements input text:
 * - Trims leading/trailing whitespace
 * - Collapses runs of 3+ blank lines into a single blank line
 * - Ensures the string contains only UTF-8 safe characters (strips null bytes and surrogates)
 */
export function parseRequirements(input: RequirementsInput): string {
  let text = input.rawText;

  // Strip null bytes and lone surrogates (UTF-8 unsafe)
  // eslint-disable-next-line no-control-regex
  text = text.replace(/\x00/g, '').replace(/[\uD800-\uDFFF]/g, '');

  // Collapse 3+ consecutive blank lines into a single blank line
  text = text.replace(/(\r?\n[ \t]*){3,}/g, '\n\n');

  return text.trim();
}

/**
 * Validates that requirements text is suitable for planning.
 *
 * Returns `valid: true` when the text meets all criteria, `valid: false`
 * with a populated `issues` array otherwise.  A non-fatal length warning
 * is appended to `issues` even when `valid` remains `true`.
 */
export function validateRequirements(text: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!text || text.trim().length === 0) {
    issues.push('Requirements must not be empty.');
    return { valid: false, issues };
  }

  if (text.trim().length < MIN_LENGTH) {
    issues.push(`Requirements are too short (minimum ${MIN_LENGTH} characters).`);
    return { valid: false, issues };
  }

  if (text.length > MAX_LENGTH) {
    issues.push(`Requirements are very long (${text.length} chars); consider trimming to under ${MAX_LENGTH} characters for best results.`);
  }

  return { valid: true, issues };
}

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export interface ParseResult {
  data: Record<string, unknown>;
  body: string;
  /** Set when the YAML block is present but fails to parse. The caller may surface this as a diagnostic warning. */
  parseError?: string;
}

/**
 * Extracts YAML frontmatter between --- delimiters and returns parsed data + remaining markdown body.
 * Returns error info instead of throwing on malformed YAML.
 */
export function parseFrontmatter(content: string): ParseResult {
  const DELIMITER = '---';

  if (!content.startsWith(DELIMITER)) {
    return { data: {}, body: content };
  }

  const end = content.indexOf('\n---', DELIMITER.length);
  if (end === -1) {
    return { data: {}, body: content };
  }

  const yamlText = content.slice(DELIMITER.length, end).trim();
  const body = content.slice(end + 4).replace(/^\n+/, '');

  try {
    const parsed = yamlParse(yamlText);
    const data: Record<string, unknown> =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { data, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: {}, body, parseError: message };
  }
}

/**
 * Converts an object back to YAML frontmatter + markdown body.
 */
export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = yamlStringify(data).trimEnd();
  const separator = body.length > 0 ? '\n\n' : '';
  return `---\n${yaml}\n---${separator}${body}`;
}

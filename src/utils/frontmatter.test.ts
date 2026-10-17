import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('splits YAML data from the markdown body', () => {
    const result = parseFrontmatter('---\nid: 1\ntags: [a, b]\n---\n\n# Body\ntext');
    expect(result).toEqual({ data: { id: 1, tags: ['a', 'b'] }, body: '# Body\ntext' });
  });

  it('returns the whole content as body when there is no opening delimiter', () => {
    expect(parseFrontmatter('# Title\n---\nx')).toEqual({ data: {}, body: '# Title\n---\nx' });
  });

  it('returns the whole content as body when the closing delimiter is missing', () => {
    expect(parseFrontmatter('---\nid: 1\nno end')).toEqual({ data: {}, body: '---\nid: 1\nno end' });
  });

  it('keeps dates as strings (YAML core schema)', () => {
    expect(parseFrontmatter('---\ncreated: 2026-01-01\n---\n').data.created).toBe('2026-01-01');
  });

  it('returns empty data for empty, scalar or array frontmatter', () => {
    expect(parseFrontmatter('---\n---\nbody').data).toEqual({});
    expect(parseFrontmatter('---\njust a string\n---\nbody').data).toEqual({});
    expect(parseFrontmatter('---\n- a\n- b\n---\nbody').data).toEqual({});
  });

  it('reports parseError for malformed YAML but still returns the body', () => {
    const result = parseFrontmatter('---\ntitle: Fix: login\n---\n\nBody');
    expect(result.data).toEqual({});
    expect(result.body).toBe('Body');
    expect(result.parseError).toMatch(/Nested mappings/);
  });

  it('only strips leading newlines from the body', () => {
    expect(parseFrontmatter('---\na: 1\n---\n\n\n  indented').body).toBe('  indented');
  });

  it('handles CRLF line endings', () => {
    const result = parseFrontmatter('---\r\nid: 1\r\nname: x\r\n---\r\nBody\r\n');
    expect(result.data).toEqual({ id: 1, name: 'x' });
    expect(result.body.trim()).toBe('Body');
  });
});

describe('serializeFrontmatter', () => {
  it('emits block-style YAML between delimiters with a blank line before the body', () => {
    expect(serializeFrontmatter({ a: 1, list: ['x', 'y'] }, '# Body')).toBe(
      '---\na: 1\nlist:\n  - x\n  - y\n---\n\n# Body'
    );
  });

  it('omits the separator when the body is empty', () => {
    expect(serializeFrontmatter({ a: 1 }, '')).toBe('---\na: 1\n---');
  });

  it('emits flow sequences for the requested keys only', () => {
    const out = serializeFrontmatter({ tags: ['a', 'b'], files: ['x'] }, 'b', ['tags']);
    expect(out).toContain('tags: [ a, b ]');
    expect(out).toContain('files:\n  - x');
  });

  it('ignores flow keys that are missing or not arrays', () => {
    const out = serializeFrontmatter({ title: 'T' }, 'b', ['tags', 'title']);
    expect(out).toBe('---\ntitle: T\n---\n\nb');
  });

  it('round-trips through parseFrontmatter', () => {
    const data = { spec_id: 'SDD-1', title: 'Fix: colon', tags: ['a'], created: '2026-01-01', empty: [] };
    const parsed = parseFrontmatter(serializeFrontmatter(data, '## Context\n\nX', ['tags']));
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe('## Context\n\nX');
  });
});

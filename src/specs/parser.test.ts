import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseSpec } from './parser';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');
// Normalized to LF: git may check fixtures out with CRLF on Windows (CRLF has its own test below).
const readFixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n');

const FRONTMATTER = `---
spec_id: SDD-001
title: Test Spec
status: draft
priority: high
complexity: low
tags: [a, b]
relevant_files: [src/foo.ts]
must_not_touch: []
depends_on: [SDD-000]
agent_skills: backend-dev
created: 2026-03-05
---
`;

describe('parseSpec — fixtures', () => {
  it('parses every frontmatter field of the sample spec', () => {
    const result = parseSpec(readFixture('sample-spec.sdd.md'));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.frontmatter).toEqual({
      spec_id: 'SDD-099',
      title: 'Sample spec for testing',
      status: 'draft',
      priority: 'medium',
      complexity: 'low',
      tags: ['testing', 'fixture'],
      relevant_files: ['src/example.ts'],
      must_not_touch: ['src/extension.ts'],
      depends_on: ['SDD-001'],
      agent_skills: 'backend-dev',
      created: '2026-01-15',
    });
  });

  it('extracts every markdown section of the sample spec', () => {
    const result = parseSpec(readFixture('sample-spec.sdd.md'));
    if (!result.success) throw new Error('expected success');
    const doc = result.data;
    expect(doc.context).toMatch(/^This is a sample spec fixture/);
    expect(doc.functionalRequirements).toBe(
      '- The parser must extract frontmatter fields correctly\n- All YAML values must map to the expected TypeScript types'
    );
    expect(doc.nonFunctionalRequirements).toBe('- Parsing must complete in under 100ms');
    expect(doc.automatedCriteria).toContain('Frontmatter is parsed without errors');
    expect(doc.automatedCriteria).not.toContain('### Manual');
    expect(doc.manualCriteria).toBe('- [ ] Spec renders correctly in the editor');
    expect(doc.constraints).toContain('Must use the YAML library');
    expect(doc.examples).toContain('```yaml');
  });

  it('parses the invalid fixture structurally (validation is the validator’s job)', () => {
    const result = parseSpec(readFixture('invalid-spec.sdd.md'));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.frontmatter.spec_id).toBe('INVALID');
    expect(result.data.context).toBe('');
    expect(result.data.functionalRequirements).toBe('');
  });
});

describe('parseSpec — errors', () => {
  it('reports every missing required field when there is no frontmatter', () => {
    const result = parseSpec('## Context\n\nNo frontmatter here');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toHaveLength(11);
    expect(result.errors[0].message).toBe('Missing required frontmatter field: spec_id');
  });

  it('reports only the fields that are missing', () => {
    const content = FRONTMATTER.replace('title: Test Spec\n', '').replace('created: 2026-03-05\n', '');
    const result = parseSpec(content);
    if (result.success) throw new Error('expected failure');
    expect(result.errors.map((e) => e.message)).toEqual([
      'Missing required frontmatter field: title',
      'Missing required frontmatter field: created',
    ]);
  });

  it('treats an explicit null value as missing', () => {
    const result = parseSpec(FRONTMATTER.replace('agent_skills: backend-dev', 'agent_skills:'));
    if (result.success) throw new Error('expected failure');
    expect(result.errors).toEqual([{ message: 'Missing required frontmatter field: agent_skills' }]);
  });

  it('returns a YAML parse error for malformed frontmatter', () => {
    const result = parseSpec('---\ntitle: [unclosed\n---\n\nbody');
    if (result.success) throw new Error('expected failure');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/^YAML parse error:/);
  });
});

describe('parseSpec — coercion and section extraction', () => {
  it('coerces scalar fields to strings and non-array lists to []', () => {
    const content = FRONTMATTER
      .replace('spec_id: SDD-001', 'spec_id: 42')
      .replace('tags: [a, b]', 'tags: single')
      .replace('depends_on: [SDD-000]', 'depends_on: SDD-000');
    const result = parseSpec(content);
    if (!result.success) throw new Error('expected success');
    expect(result.data.frontmatter.spec_id).toBe('42');
    expect(result.data.frontmatter.tags).toEqual([]);
    expect(result.data.frontmatter.depends_on).toEqual([]);
  });

  it('returns empty strings for absent sections', () => {
    const result = parseSpec(FRONTMATTER + '\n## Context\n\nOnly context.\n');
    if (!result.success) throw new Error('expected success');
    expect(result.data.context).toBe('Only context.');
    expect(result.data.functionalRequirements).toBe('');
    expect(result.data.automatedCriteria).toBe('');
    expect(result.data.constraints).toBe('');
    expect(result.data.examples).toBe('');
  });

  it('does not let a ### heading end a ## section', () => {
    const body = '\n## Context\n\nIntro\n\n### Detail\n\nMore\n\n## Constraints\n- c1\n';
    const result = parseSpec(FRONTMATTER + body);
    if (!result.success) throw new Error('expected success');
    expect(result.data.context).toBe('Intro\n\n### Detail\n\nMore');
    expect(result.data.constraints).toBe('- c1');
  });

  it('does not match a heading that only starts with the section name', () => {
    const body = '\n## Context extra\n\nWrong\n\n## Context\n\nRight\n';
    const result = parseSpec(FRONTMATTER + body);
    if (!result.success) throw new Error('expected success');
    expect(result.data.context).toBe('Right');
  });

  it('handles CRLF line endings', () => {
    const crlf = readFixture('sample-spec.sdd.md').replace(/\r?\n/g, '\r\n');
    const result = parseSpec(crlf);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.frontmatter.spec_id).toBe('SDD-099');
    expect(result.data.nonFunctionalRequirements).toBe('- Parsing must complete in under 100ms');
    expect(result.data.manualCriteria).toBe('- [ ] Spec renders correctly in the editor');
    expect(result.data.context).not.toBe('');
  });
});

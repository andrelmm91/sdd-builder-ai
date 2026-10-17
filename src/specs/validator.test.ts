import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validateSpec } from './validator';
import { parseSpec } from './parser';
import { createMockDocument, createMockSpec } from '../../test/setup';
import type { SpecData } from './types';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures');

function docWith(fm: Partial<SpecData> | Record<string, unknown>) {
  return createMockDocument({ frontmatter: createMockSpec(fm as Partial<SpecData>) });
}

function errorFields(result: ReturnType<typeof validateSpec>, severity: 'error' | 'warning' = 'error') {
  return result.errors.filter((e) => e.severity === severity).map((e) => e.field);
}

describe('validateSpec — fixtures', () => {
  it('accepts the sample fixture with no errors or warnings', () => {
    const parsed = parseSpec(fs.readFileSync(path.join(FIXTURES, 'sample-spec.sdd.md'), 'utf8'));
    if (!parsed.success) throw new Error('fixture should parse');
    expect(validateSpec(parsed.data)).toEqual({ valid: true, errors: [] });
  });

  it('flags every problem in the invalid fixture', () => {
    const parsed = parseSpec(fs.readFileSync(path.join(FIXTURES, 'invalid-spec.sdd.md'), 'utf8'));
    if (!parsed.success) throw new Error('fixture should parse');
    const result = validateSpec(parsed.data);
    expect(result.valid).toBe(false);
    expect(errorFields(result)).toEqual(
      expect.arrayContaining([
        'spec_id', 'title', 'status', 'priority', 'complexity', 'tags',
        'relevant_files', 'agent_skills', 'created',
        'context', 'functionalRequirements', 'automatedCriteria',
      ])
    );
    expect(errorFields(result, 'warning')).toEqual(['nonFunctionalRequirements', 'constraints']);
  });
});

describe('validateSpec — frontmatter', () => {
  it('accepts a valid mock document', () => {
    expect(validateSpec(createMockDocument()).valid).toBe(true);
  });

  it.each(['SDD-001', 'SPEC-12', 'ABC-1-hotfix', 'x1-9'])('accepts spec_id %s', (spec_id) => {
    expect(errorFields(validateSpec(docWith({ spec_id })))).not.toContain('spec_id');
  });

  it.each(['SDD', 'SDD-', 'SDD-abc', '-001', 'SDD 001'])('rejects spec_id %s', (spec_id) => {
    expect(errorFields(validateSpec(docWith({ spec_id })))).toContain('spec_id');
  });

  it.each([
    ['status', 'blocked'],
    ['priority', 'urgent'],
    ['complexity', 'trivial'],
  ])('rejects %s outside its enum', (field, value) => {
    expect(errorFields(validateSpec(docWith({ [field]: value })))).toContain(field);
  });

  it('requires at least one tag and one relevant file', () => {
    const result = validateSpec(docWith({ tags: [], relevant_files: [] }));
    expect(errorFields(result)).toEqual(expect.arrayContaining(['tags', 'relevant_files']));
  });

  it('allows empty must_not_touch and depends_on', () => {
    expect(validateSpec(docWith({ must_not_touch: [], depends_on: [] })).valid).toBe(true);
  });

  it('rejects an empty title and agent_skills', () => {
    const result = validateSpec(docWith({ title: '', agent_skills: '' }));
    expect(errorFields(result)).toEqual(expect.arrayContaining(['title', 'agent_skills']));
  });

  it('reports missing properties by field name', () => {
    const doc = createMockDocument();
    delete (doc.frontmatter as Partial<SpecData>).title;
    const result = validateSpec(doc);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'title', severity: 'error' }));
  });

  it('maps nested array item errors to the array field path', () => {
    const result = validateSpec(docWith({ tags: ['ok', 42 as unknown as string] }));
    expect(errorFields(result)).toContain('tags/1');
  });

  it('allows additional frontmatter properties', () => {
    expect(validateSpec(docWith({ owner: 'someone' })).valid).toBe(true);
  });
});

describe('validateSpec — created date', () => {
  it.each(['2026-01-01', '2024-02-29', '2026-12-31'])('accepts %s', (created) => {
    expect(errorFields(validateSpec(docWith({ created })))).not.toContain('created');
  });

  it.each(['2026/01/01', '26-01-01', 'yesterday'])('rejects badly formatted %s once (pattern only)', (created) => {
    const createdErrors = validateSpec(docWith({ created })).errors.filter((e) => e.field === 'created');
    expect(createdErrors).toHaveLength(1);
  });

  it.each(['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10'])(
    'rejects impossible calendar date %s',
    (created) => {
      const result = validateSpec(docWith({ created }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'created',
        message: 'created must be a valid calendar date',
        severity: 'error',
      });
    }
  );
});

describe('validateSpec — sections', () => {
  it.each(['context', 'functionalRequirements', 'automatedCriteria'] as const)(
    'errors when %s is blank or whitespace',
    (section) => {
      for (const value of ['', '   \n  ']) {
        const result = validateSpec(createMockDocument({ [section]: value }));
        expect(result.valid).toBe(false);
        expect(errorFields(result)).toEqual([section]);
      }
    }
  );

  it.each(['nonFunctionalRequirements', 'constraints'] as const)('only warns when %s is blank', (section) => {
    const result = validateSpec(createMockDocument({ [section]: '' }));
    expect(result.valid).toBe(true);
    expect(errorFields(result, 'warning')).toEqual([section]);
  });

  it('does not require manual criteria or examples', () => {
    expect(validateSpec(createMockDocument({ manualCriteria: '', examples: '' }))).toEqual({ valid: true, errors: [] });
  });
});

describe('validateSpec — relevant_files limit', () => {
  it('allows up to 3 non-test files', () => {
    const result = validateSpec(docWith({ relevant_files: ['a.ts', 'b.ts', 'c.ts'] }));
    expect(result.errors).toEqual([]);
  });

  it('warns (without invalidating) above 3 non-test files', () => {
    const result = validateSpec(docWith({ relevant_files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([
      expect.objectContaining({ field: 'relevant_files', severity: 'warning', message: expect.stringContaining('4 non-test files') }),
    ]);
  });

  it('does not count test files toward the limit', () => {
    const relevant_files = ['a.ts', 'b.ts', 'c.ts', 'a.test.ts', 'b.spec.ts', 'src/__TESTS__/c.ts'];
    expect(validateSpec(docWith({ relevant_files })).errors).toEqual([]);
  });
});

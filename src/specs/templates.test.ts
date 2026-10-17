import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSpecFromTemplate, getTemplateDescription } from './templates';
import { parseSpec } from './parser';
import type { SpecTemplate } from './types';

const TEMPLATES: SpecTemplate[] = ['feature', 'bugfix', 'refactor'];

afterEach(() => {
  vi.useRealTimers();
});

describe('generateSpecFromTemplate', () => {
  it.each(TEMPLATES)('%s template parses into a complete spec document', (template) => {
    const result = parseSpec(generateSpecFromTemplate({ template, specId: 'SDD-010', title: 'Title', created: '2026-01-02' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const doc = result.data;
    expect(doc.frontmatter).toMatchObject({
      spec_id: 'SDD-010',
      title: 'Title',
      status: 'draft',
      priority: 'medium',
      complexity: 'medium',
      tags: [template],
      relevant_files: [],
      agent_skills: 'backend-dev',
      created: '2026-01-02',
    });
    for (const section of ['context', 'functionalRequirements', 'nonFunctionalRequirements', 'automatedCriteria', 'manualCriteria', 'constraints', 'examples'] as const) {
      expect(doc[section], section).not.toBe('');
    }
  });

  it('uses a placeholder title when none is given', () => {
    const result = parseSpec(generateSpecFromTemplate({ template: 'feature', specId: 'SDD-002' }));
    if (!result.success) throw new Error('expected success');
    expect(result.data.frontmatter.title).toBe('<!-- Spec title for SDD-002 -->');
  });

  it('uses custom tags when provided', () => {
    const result = parseSpec(generateSpecFromTemplate({ template: 'bugfix', specId: 'SDD-003', tags: ['ui', 'auth'] }));
    if (!result.success) throw new Error('expected success');
    expect(result.data.frontmatter.tags).toEqual(['ui', 'auth']);
  });

  it('defaults created to today (UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
    expect(generateSpecFromTemplate({ template: 'refactor', specId: 'SDD-004' })).toContain('created: 2026-07-04');
  });

  it.each(['Fix: login bug', '#123 crash', '[WIP] refactor', 'yes', '42', 'It\'s "quoted"', 'Plain title'])(
    'keeps title %j intact through YAML',
    (title) => {
      const result = parseSpec(generateSpecFromTemplate({ template: 'feature', specId: 'SDD-005', title }));
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.frontmatter.title).toBe(title);
    }
  );

  it('writes plain titles unquoted', () => {
    expect(generateSpecFromTemplate({ template: 'feature', specId: 'SDD-006', title: 'Add login' })).toContain('\ntitle: Add login\n');
  });

  it('bugfix template includes reproduction guidance', () => {
    expect(generateSpecFromTemplate({ template: 'bugfix', specId: 'SDD-007' })).toContain('**Reproduction steps:**');
  });
});

describe('getTemplateDescription', () => {
  it.each(TEMPLATES)('returns a description for %s', (template) => {
    expect(getTemplateDescription(template)).toMatch(/\S+ — /);
  });

  it('describes each template distinctly', () => {
    expect(new Set(TEMPLATES.map(getTemplateDescription)).size).toBe(3);
  });
});

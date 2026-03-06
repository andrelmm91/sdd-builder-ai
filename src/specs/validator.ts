import Ajv from 'ajv';
import type { SpecDocument } from './types';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// JSON Schema for frontmatter (SDD-005)
// ---------------------------------------------------------------------------

const FRONTMATTER_SCHEMA = {
  type: 'object',
  required: [
    'spec_id', 'title', 'status', 'priority', 'complexity',
    'tags', 'relevant_files', 'must_not_touch', 'depends_on', 'budget_max_tokens', 'agent_skills', 'created',
  ],
  properties: {
    spec_id:           { type: 'string', pattern: '^[A-Za-z0-9]+-[0-9]+$' },
    title:             { type: 'string', minLength: 1 },
    status:            { type: 'string', enum: ['draft', 'ready', 'in_progress', 'review', 'done'] },
    priority:          { type: 'string', enum: ['high', 'medium', 'low'] },
    complexity:        { type: 'string', enum: ['low', 'medium', 'high'] },
    tags:              { type: 'array', items: { type: 'string' }, minItems: 1 },
    relevant_files:    { type: 'array', items: { type: 'string' }, minItems: 1 },
    must_not_touch:    { type: 'array', items: { type: 'string' } },
    depends_on:        { type: 'array', items: { type: 'string' } },
    budget_max_tokens: { type: 'number', minimum: 1 },
    agent_skills:      { type: 'string', minLength: 1 },
    created:           { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
  additionalProperties: true,
} as const;

const ajv = new Ajv({ allErrors: true });
const ajvValidate = ajv.compile(FRONTMATTER_SCHEMA);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  return !isNaN(new Date(dateStr).getTime());
}

function validateFrontmatterFields(fm: SpecDocument['frontmatter'], errors: ValidationError[]): void {
  // Ajv validates required fields, types, enums, patterns, and array constraints.
  if (!ajvValidate(fm)) {
    for (const ajvErr of ajvValidate.errors ?? []) {
      let field: string;
      if (ajvErr.keyword === 'required' && 'missingProperty' in ajvErr.params) {
        field = ajvErr.params.missingProperty as string;
      } else {
        field = ajvErr.instancePath.replace(/^\//, '') || 'frontmatter';
      }
      errors.push({ field, message: ajvErr.message ?? `Invalid value for ${field}`, severity: 'error' });
    }
  }

  // Calendar date validity cannot be expressed in JSON Schema — check manually.
  if (fm.created && DATE_PATTERN.test(fm.created) && !isValidDate(fm.created)) {
    errors.push({ field: 'created', message: 'created must be a valid calendar date', severity: 'error' });
  }
}

export function validateSpec(spec: SpecDocument): ValidationResult {
  const errors: ValidationError[] = [];

  // --- Frontmatter validation (Ajv + calendar check) ---
  validateFrontmatterFields(spec.frontmatter, errors);

  // --- Markdown section completeness (errors) ---
  if (!spec.context || spec.context.trim() === '') {
    errors.push({ field: 'context', message: 'Context section must be non-empty', severity: 'error' });
  }

  if (!spec.functionalRequirements || spec.functionalRequirements.trim() === '') {
    errors.push({ field: 'functionalRequirements', message: 'At least one functional requirement must exist', severity: 'error' });
  }

  if (!spec.automatedCriteria || spec.automatedCriteria.trim() === '') {
    errors.push({ field: 'automatedCriteria', message: 'At least one automated acceptance criterion must exist', severity: 'error' });
  }

  // --- Warnings ---
  const nonTestFiles = spec.frontmatter.relevant_files.filter(
    f => !f.includes('.test.') && !f.includes('.spec.') && !f.toLowerCase().includes('__tests__')
  );
  if (nonTestFiles.length > 3) {
    errors.push({
      field: 'relevant_files',
      message: `relevant_files has ${nonTestFiles.length} non-test files (limit is 3). Consider splitting this spec.`,
      severity: 'warning',
    });
  }

  if (spec.frontmatter.budget_max_tokens > 200000) {
    errors.push({
      field: 'budget_max_tokens',
      message: `budget_max_tokens (${spec.frontmatter.budget_max_tokens}) exceeds the recommended limit of 200000`,
      severity: 'warning',
    });
  }

  if (!spec.nonFunctionalRequirements || spec.nonFunctionalRequirements.trim() === '') {
    errors.push({
      field: 'nonFunctionalRequirements',
      message: 'Missing non-functional requirements section',
      severity: 'warning',
    });
  }

  if (!spec.constraints || spec.constraints.trim() === '') {
    errors.push({
      field: 'constraints',
      message: 'Missing constraints section',
      severity: 'warning',
    });
  }

  const hasErrors = errors.some(e => e.severity === 'error');
  return { valid: !hasErrors, errors };
}

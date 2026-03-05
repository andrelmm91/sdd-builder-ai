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

const frontmatterSchema = {
  type: 'object',
  properties: {
    spec_id: {
      type: 'string',
      pattern: '^[A-Za-z0-9]+-[0-9]+$',
    },
    title: {
      type: 'string',
      minLength: 1,
    },
    status: {
      type: 'string',
      enum: ['draft', 'ready', 'in_progress', 'review', 'done'],
    },
    priority: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    complexity: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    relevant_files: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    depends_on: {
      type: 'array',
      items: { type: 'string' },
    },
    budget_max_tokens: {
      type: 'number',
      exclusiveMinimum: 0,
    },
    agent_skills: {
      type: 'string',
      minLength: 1,
    },
    created: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
  },
  required: [
    'spec_id',
    'title',
    'status',
    'priority',
    'complexity',
    'tags',
    'relevant_files',
    'depends_on',
    'budget_max_tokens',
    'agent_skills',
    'created',
  ],
  additionalProperties: true,
} as const;

const ajv = new Ajv({ allErrors: true });
const validateFrontmatter = ajv.compile(frontmatterSchema);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function resolveFriendlyMessage(keyword: string, field: string, params: Record<string, unknown>): string {
  switch (keyword) {
    case 'pattern':
      if (field === 'spec_id') {
        return 'spec_id must match pattern {PREFIX}-{NNN} (e.g. SDD-001)';
      }
      if (field === 'created') {
        return 'created must be a valid date string (YYYY-MM-DD)';
      }
      return `${field} has an invalid format`;
    case 'minLength':
      return `${field} must be non-empty`;
    case 'enum':
      return `${field} must be one of: ${(params.allowedValues as string[]).join(', ')}`;
    case 'minItems':
      return `${field} must be a non-empty array`;
    case 'exclusiveMinimum':
      return 'budget_max_tokens must be a positive number';
    case 'required':
      return `Missing required frontmatter field: ${params.missingProperty as string}`;
    case 'type':
      return `${field} has an invalid type`;
    default:
      return `${field}: validation failed (${keyword})`;
  }
}

export function validateSpec(spec: SpecDocument): ValidationResult {
  const errors: ValidationError[] = [];

  // --- JSON Schema validation of frontmatter ---
  const schemaValid = validateFrontmatter(spec.frontmatter);
  if (!schemaValid && validateFrontmatter.errors) {
    for (const err of validateFrontmatter.errors) {
      const params = (err.params ?? {}) as Record<string, unknown>;
      const field = err.instancePath
        ? err.instancePath.replace(/^\//, '')
        : ((params.missingProperty as string) ?? 'frontmatter');
      const message = resolveFriendlyMessage(err.keyword, field, params);
      errors.push({ field, message, severity: 'error' });
    }
  }

  // Additional date validity check (pattern match is not enough for e.g. 2026-02-31)
  if (spec.frontmatter.created && DATE_PATTERN.test(spec.frontmatter.created)) {
    if (!isValidDate(spec.frontmatter.created)) {
      errors.push({ field: 'created', message: 'created must be a valid calendar date', severity: 'error' });
    }
  }

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

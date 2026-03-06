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

const VALID_STATUSES = new Set(['draft', 'ready', 'in_progress', 'review', 'done']);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
const VALID_COMPLEXITIES = new Set(['low', 'medium', 'high']);
const SPEC_ID_PATTERN = /^[A-Za-z0-9]+-[0-9]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function validateFrontmatterFields(fm: SpecDocument['frontmatter'], errors: ValidationError[]): void {
  const required: (keyof typeof fm)[] = [
    'spec_id', 'title', 'status', 'priority', 'complexity',
    'tags', 'relevant_files', 'depends_on', 'budget_max_tokens', 'agent_skills', 'created',
  ];

  for (const field of required) {
    if (fm[field] === undefined || fm[field] === null) {
      errors.push({ field, message: `Missing required frontmatter field: ${field}`, severity: 'error' });
    }
  }

  if (fm.spec_id && !SPEC_ID_PATTERN.test(fm.spec_id)) {
    errors.push({ field: 'spec_id', message: 'spec_id must match pattern {PREFIX}-{NNN} (e.g. SDD-001)', severity: 'error' });
  }

  if (fm.title !== undefined && (typeof fm.title !== 'string' || fm.title.trim() === '')) {
    errors.push({ field: 'title', message: 'title must be non-empty', severity: 'error' });
  }

  if (fm.status !== undefined && !VALID_STATUSES.has(fm.status)) {
    errors.push({ field: 'status', message: `status must be one of: ${[...VALID_STATUSES].join(', ')}`, severity: 'error' });
  }

  if (fm.priority !== undefined && !VALID_PRIORITIES.has(fm.priority)) {
    errors.push({ field: 'priority', message: `priority must be one of: ${[...VALID_PRIORITIES].join(', ')}`, severity: 'error' });
  }

  if (fm.complexity !== undefined && !VALID_COMPLEXITIES.has(fm.complexity)) {
    errors.push({ field: 'complexity', message: `complexity must be one of: ${[...VALID_COMPLEXITIES].join(', ')}`, severity: 'error' });
  }

  if (fm.tags !== undefined && (!Array.isArray(fm.tags) || fm.tags.length === 0)) {
    errors.push({ field: 'tags', message: 'tags must be a non-empty array', severity: 'error' });
  }

  if (fm.relevant_files !== undefined && (!Array.isArray(fm.relevant_files) || fm.relevant_files.length === 0)) {
    errors.push({ field: 'relevant_files', message: 'relevant_files must be a non-empty array', severity: 'error' });
  }

  if (fm.depends_on !== undefined && !Array.isArray(fm.depends_on)) {
    errors.push({ field: 'depends_on', message: 'depends_on must be an array', severity: 'error' });
  }

  if (fm.budget_max_tokens !== undefined && (typeof fm.budget_max_tokens !== 'number' || fm.budget_max_tokens <= 0)) {
    errors.push({ field: 'budget_max_tokens', message: 'budget_max_tokens must be a positive number', severity: 'error' });
  }

  if (fm.agent_skills !== undefined && (typeof fm.agent_skills !== 'string' || fm.agent_skills.trim() === '')) {
    errors.push({ field: 'agent_skills', message: 'agent_skills must be non-empty', severity: 'error' });
  }

  if (fm.created !== undefined) {
    if (!DATE_PATTERN.test(fm.created)) {
      errors.push({ field: 'created', message: 'created must be a valid date string (YYYY-MM-DD)', severity: 'error' });
    } else if (!isValidDate(fm.created)) {
      errors.push({ field: 'created', message: 'created must be a valid calendar date', severity: 'error' });
    }
  }
}

export function validateSpec(spec: SpecDocument): ValidationResult {
  const errors: ValidationError[] = [];

  // --- Frontmatter validation ---
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

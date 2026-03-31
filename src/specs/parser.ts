import { parseFrontmatter } from '../utils/frontmatter';
import type { SpecData, SpecDocument } from './types';

export interface ParseError {
  message: string;
  line?: number;
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ParseError[] };

const REQUIRED_FIELDS: (keyof SpecData)[] = [
  'spec_id',
  'title',
  'status',
  'priority',
  'complexity',
  'tags',
  'relevant_files',
  'must_not_touch',
  'depends_on',
  'agent_skills',
  'created',
];

/**
 * Extracts text content of a top-level `##` section (excluding its own sub-sections).
 * Returns empty string if the section is not found.
 */
function extractSection(body: string, heading: string): string {
  const headingPattern = new RegExp(`^## ${heading}\\s*$`, 'm');
  const match = headingPattern.exec(body);
  if (!match) {
    return '';
  }

  const start = match.index + match[0].length;
  const rest = body.slice(start);

  // End at the next `##` section (same level or higher)
  const nextSection = /^## /m.exec(rest);
  const sectionBody = nextSection ? rest.slice(0, nextSection.index) : rest;
  return sectionBody.trim();
}

/**
 * Extracts text content of a `###` sub-section within an already-extracted section body.
 * Returns empty string if the sub-section is not found.
 */
function extractSubSection(sectionBody: string, heading: string): string {
  const headingPattern = new RegExp(`^### ${heading}\\s*$`, 'm');
  const match = headingPattern.exec(sectionBody);
  if (!match) {
    return '';
  }

  const start = match.index + match[0].length;
  const rest = sectionBody.slice(start);

  const nextSubSection = /^### /m.exec(rest);
  const subBody = nextSubSection ? rest.slice(0, nextSubSection.index) : rest;
  return subBody.trim();
}

/**
 * Parses a full `.sdd.md` file string into a structured `SpecDocument`.
 * Pure function — no I/O. Returns errors instead of throwing on malformed input.
 */
export function parseSpec(content: string): ParseResult<SpecDocument> {
  const { data, body, parseError } = parseFrontmatter(content);

  if (parseError) {
    return { success: false, errors: [{ message: `YAML parse error: ${parseError}` }] };
  }

  // Validate required frontmatter fields
  const errors: ParseError[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      errors.push({ message: `Missing required frontmatter field: ${field}` });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const raw = data as Record<string, unknown>;

  const frontmatter: SpecData = {
    spec_id: String(raw.spec_id),
    title: String(raw.title),
    status: raw.status as SpecData['status'],
    priority: raw.priority as SpecData['priority'],
    complexity: raw.complexity as SpecData['complexity'],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    relevant_files: Array.isArray(raw.relevant_files) ? (raw.relevant_files as string[]) : [],
    must_not_touch: Array.isArray(raw.must_not_touch) ? (raw.must_not_touch as string[]) : [],
    depends_on: Array.isArray(raw.depends_on) ? (raw.depends_on as string[]) : [],
    agent_skills: String(raw.agent_skills),
    created: String(raw.created),
  };

  const requirementsBody = extractSection(body, 'Requirements');
  const criteriaBody = extractSection(body, 'Acceptance Criteria');

  const document: SpecDocument = {
    frontmatter,
    context: extractSection(body, 'Context'),
    functionalRequirements: extractSubSection(requirementsBody, 'Functional'),
    nonFunctionalRequirements: extractSubSection(requirementsBody, 'Non-Functional'),
    automatedCriteria: extractSubSection(criteriaBody, 'Automated'),
    manualCriteria: extractSubSection(criteriaBody, 'Manual'),
    constraints: extractSection(body, 'Constraints'),
    examples: extractSection(body, 'Examples'),
  };

  return { success: true, data: document };
}

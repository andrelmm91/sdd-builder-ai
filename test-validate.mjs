import { parse } from 'yaml';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

const ajv = new Ajv.default({ allErrors: true });

const FRONTMATTER_SCHEMA = {
  type: 'object',
  required: ['spec_id','title','status','priority','complexity','tags','relevant_files','must_not_touch','depends_on','budget_max_tokens','agent_skills','created'],
  properties: {
    spec_id: { type: 'string', pattern: '^[A-Za-z0-9]+-[0-9]+$' },
    title: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: ['draft','ready','in_progress','review','done'] },
    priority: { type: 'string', enum: ['high','medium','low'] },
    complexity: { type: 'string', enum: ['low','medium','high'] },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
    relevant_files: { type: 'array', items: { type: 'string' }, minItems: 1 },
    must_not_touch: { type: 'array', items: { type: 'string' } },
    depends_on: { type: 'array', items: { type: 'string' } },
    budget_max_tokens: { type: 'number', minimum: 1 },
    agent_skills: { type: 'string', minLength: 1 },
    created: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
  additionalProperties: true
};

const ajvValidate = ajv.compile(FRONTMATTER_SCHEMA);

function parseFrontmatter(content) {
  const DELIMITER = '---';
  if (!content.startsWith(DELIMITER)) return { data: {}, body: content };
  const end = content.indexOf('\n---', DELIMITER.length);
  if (end === -1) return { data: {}, body: content };
  const yamlText = content.slice(DELIMITER.length, end).trim();
  const body = content.slice(end + 4).replace(/^\n/, '');
  try {
    const parsed = parse(yamlText);
    const data = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return { data, body };
  } catch(err) {
    return { data: {}, body, parseError: err.message };
  }
}

function extractSection(body, heading) {
  const headingPattern = new RegExp(`^## ${heading}\\s*$`, 'm');
  const match = headingPattern.exec(body);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextSection = /^## /m.exec(rest);
  const sectionBody = nextSection ? rest.slice(0, nextSection.index) : rest;
  return sectionBody.trim();
}

function extractSubSection(sectionBody, heading) {
  const headingPattern = new RegExp(`^### ${heading}\\s*$`, 'm');
  const match = headingPattern.exec(sectionBody);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = sectionBody.slice(start);
  const nextSubSection = /^### /m.exec(rest);
  const subBody = nextSubSection ? rest.slice(0, nextSubSection.index) : rest;
  return subBody.trim();
}

const specFiles = readdirSync('.specs').filter(f => f.endsWith('.sdd.md'));
let totalIssues = 0;
const allIssues = {};

for (const file of specFiles) {
  const content = readFileSync(join('.specs', file), 'utf8');
  const { data, body, parseError } = parseFrontmatter(content);
  const issues = [];

  if (parseError) {
    issues.push('YAML parse error: ' + parseError);
    allIssues[file] = issues;
    totalIssues++;
    continue;
  }

  // Schema validation
  if (!ajvValidate(data)) {
    for (const err of ajvValidate.errors || []) {
      issues.push(`Schema: ${err.instancePath || err.params?.missingProperty} - ${err.message}`);
    }
  }

  // Section checks
  const context = extractSection(body, 'Context');
  const reqBody = extractSection(body, 'Requirements');
  const funcReq = extractSubSection(reqBody, 'Functional');
  const criteriaBody = extractSection(body, 'Acceptance Criteria');
  const autoCriteria = extractSubSection(criteriaBody, 'Automated');

  if (!context) issues.push('Error: Context section must be non-empty');
  if (!funcReq) issues.push('Error: Functional requirements must exist');
  if (!autoCriteria) issues.push('Error: Automated criteria must exist');

  if (issues.length > 0) {
    allIssues[file] = issues;
    totalIssues += issues.length;
  }
}

console.log(`Total issues: ${totalIssues} across ${Object.keys(allIssues).length} / ${specFiles.length} files`);
for (const [f, issues] of Object.entries(allIssues)) {
  console.log(`\n${f}:`);
  for (const i of issues) console.log(`  ${i}`);
}

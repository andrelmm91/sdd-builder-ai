import { parse } from 'yaml';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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

const REQUIRED_FIELDS = ['spec_id','title','status','priority','complexity','tags','relevant_files','must_not_touch','depends_on','budget_max_tokens','agent_skills','created'];

const specFiles = readdirSync('.specs').filter(f => f.endsWith('.sdd.md'));
const issues = {};
for (const file of specFiles) {
  const content = readFileSync(join('.specs', file), 'utf8');
  const { data, body, parseError } = parseFrontmatter(content);
  const fileIssues = [];
  if (parseError) { fileIssues.push('YAML parse error: ' + parseError); }
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) fileIssues.push('missing field: ' + field);
  }
  if (Array.isArray(data.relevant_files) && data.relevant_files.length === 0) fileIssues.push('relevant_files is empty');
  if (Array.isArray(data.tags) && data.tags.length === 0) fileIssues.push('tags is empty');
  if (fileIssues.length > 0) issues[file] = fileIssues;
}
console.log('Files with issues:', Object.keys(issues).length, '/', specFiles.length);
for (const [f, i] of Object.entries(issues)) console.log(f + ':\n  ' + i.join('\n  '));

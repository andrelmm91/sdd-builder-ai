import { readWorkspaceFile, listFiles } from '../utils/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { CONVENTIONS_FILE, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { getNextSpecId } from '../specs/specIdGenerator';
import type { PlanningRequest } from './types';

const MAX_CONTEXT_BYTES = 50 * 1024;

interface SpecSummary {
  specId: string;
  title: string;
  status: string;
}

/**
 * Reads all existing spec files from the workspace and extracts their ID, title, and status.
 */
async function loadExistingSpecs(): Promise<SpecSummary[]> {
  const pattern = `${SPECS_FOLDER}/*${SPEC_FILE_EXTENSION}`;
  const files = await listFiles(pattern);
  const specs: SpecSummary[] = [];

  for (const file of files) {
    const content = await readWorkspaceFile(file);
    if (!content) {
      continue;
    }

    const { data } = parseFrontmatter(content);
    const specId = typeof data.spec_id === 'string' ? data.spec_id : '';
    const title = typeof data.title === 'string' ? data.title : '(no title)';
    const status = typeof data.status === 'string' ? data.status : 'draft';

    if (specId) {
      specs.push({ specId, title, status });
    }
  }

  return specs.sort((a, b) => a.specId.localeCompare(b.specId));
}

/**
 * Lists workspace files for the project file tree, excluding noise directories.
 */
async function buildFileTree(): Promise<string> {
  const files = await listFiles('**/*');
  const filtered = files.filter(
    (f) =>
      !f.startsWith('node_modules/') &&
      !f.startsWith('.git/') &&
      !f.startsWith('dist/'),
  );
  return filtered.join('\n');
}

function buildSpecFormatReference(): string {
  return `## Spec Format Reference

Each spec is a \`.sdd.md\` file with a YAML frontmatter block followed by Markdown sections.

### YAML Frontmatter Schema

\`\`\`yaml
---
spec_id: <PREFIX>-<NNN>          # e.g. SDD-042
title: Short descriptive title
status: draft                    # draft | ready | in_progress | review | done
priority: medium                 # high | medium | low
complexity: medium               # low | medium | high
tags: [phase-1, backend]
relevant_files:
  - src/path/to/file.ts
must_not_touch:
  - src/path/to/protected.ts
depends_on: [SDD-001, SDD-002]
budget_max_tokens: 100000
agent_skills: backend-dev
created: YYYY-MM-DD
---
\`\`\`

### Markdown Sections

\`\`\`markdown
## Context

Describe what this spec is about and why it is needed.

## Requirements

### Functional
- [ ] Primary behaviour the code must implement

### Non-Functional
- [ ] Performance, security, or accessibility requirements

## Acceptance Criteria

### Automated
- [ ] Unit tests pass
- [ ] TypeScript compilation passes

### Manual
- [ ] Feature behaves as described when exercised manually

## Constraints
- List any hard constraints the agent must not violate
\`\`\``;
}

function buildInstructions(prefix: string, startingId: string): string {
  return `## Instructions

- Use **${prefix}** as the spec ID prefix.
- Start numbering from **${startingId}** (next available ID after existing specs).
- Generate one spec per distinct, independently-deliverable unit of work.
- Each spec must have a unique \`spec_id\`, a clear title, and all required frontmatter fields.
- Do NOT duplicate any existing spec listed in the **Existing Specs** section.
- Assign realistic \`budget_max_tokens\` (typically 50000–150000 depending on complexity).
- Set \`status: draft\` on all generated specs.`;
}

/**
 * Assembles a full context markdown document for the SDD Planner agent.
 *
 * The returned string is ready to be passed to Claude CLI alongside the
 * sdd-planner skills file — it contains all the information the planner
 * needs to decompose requirements into valid spec files without duplicating
 * existing work.
 */
export async function assemblePlanContext(request: PlanningRequest): Promise<string> {
  const sections: string[] = [];

  // 1. Requirements
  sections.push(`## Requirements\n\n${request.requirements}`);

  // 2. Project File Tree
  const treeContent = request.repoTree ?? (await buildFileTree());
  if (treeContent) {
    sections.push(`## Project File Tree\n\n\`\`\`\n${treeContent}\n\`\`\``);
  }

  // 3. Existing Specs (read from filesystem for titles and statuses)
  const existingSpecs = await loadExistingSpecs();
  if (existingSpecs.length > 0) {
    const specLines = existingSpecs
      .map((s) => `- **${s.specId}** — ${s.title} *(${s.status})*`)
      .join('\n');
    sections.push(`## Existing Specs\n\n${specLines}`);
  } else {
    sections.push(`## Existing Specs\n\n_No existing specs found._`);
  }

  // 4. Project Conventions (optional — skip gracefully if file missing)
  const conventions = await readWorkspaceFile(CONVENTIONS_FILE);
  if (conventions) {
    sections.push(`## Project Conventions\n\n${conventions}`);
  }

  // 5. Spec Format Reference
  sections.push(buildSpecFormatReference());

  // 6. Instructions — include starting ID computed from all known spec IDs
  const fsSpecIds = existingSpecs.map((s) => s.specId);
  const allKnownIds = [...new Set([...fsSpecIds, ...request.existingSpecIds])];
  const startingId = getNextSpecId(allKnownIds, request.projectPrefix);
  sections.push(buildInstructions(request.projectPrefix, startingId));

  // Optional: Refinement Feedback
  if (request.feedback) {
    sections.push(`## Refinement Feedback\n\n${request.feedback}`);
  }

  const document = sections.join('\n\n---\n\n');

  // Truncate to stay within the 50 KB limit
  if (Buffer.byteLength(document, 'utf8') > MAX_CONTEXT_BYTES) {
    return Buffer.from(document, 'utf8').slice(0, MAX_CONTEXT_BYTES).toString('utf8');
  }

  return document;
}

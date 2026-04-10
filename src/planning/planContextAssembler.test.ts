import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlanningRequest } from './types';

// Mock the fileSystem module before importing the assembler
vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  listFiles: vi.fn(),
}));

import { assemblePlanContext } from './planContextAssembler';
import { readWorkspaceFile, listFiles } from '../utils/fileSystem';

const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockListFiles = vi.mocked(listFiles);

function makeRequest(overrides: Partial<PlanningRequest> = {}): PlanningRequest {
  return {
    requirements: 'Add a user authentication system with OAuth2 support.',
    existingSpecIds: [],
    projectPrefix: 'SDD',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no spec files, no conventions
  mockListFiles.mockResolvedValue([]);
  mockReadWorkspaceFile.mockResolvedValue(undefined);
});

describe('assemblePlanContext', () => {
  it('includes a Requirements section with the request requirements text', async () => {
    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Requirements');
    expect(result).toContain('Add a user authentication system with OAuth2 support.');
  });

  it('includes a Project File Tree section using request.repoTree when provided', async () => {
    const request = makeRequest({ repoTree: 'src/\n  index.ts\n  utils.ts' });
    const result = await assemblePlanContext(request);
    expect(result).toContain('## Project File Tree');
    expect(result).toContain('src/');
    expect(result).toContain('index.ts');
    // listFiles should not be called when repoTree is already provided
    expect(mockListFiles).not.toHaveBeenCalledWith('**/*');
  });

  it('builds Project File Tree from filesystem when repoTree is not provided', async () => {
    mockListFiles.mockImplementation(async (pattern: string) => {
      if (pattern === '**/*') {
        return ['src/index.ts', 'node_modules/lodash/index.js', '.git/HEAD', 'dist/out.js'];
      }
      return [];
    });

    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Project File Tree');
    expect(result).toContain('src/index.ts');
    // Excluded paths must not appear in the tree
    expect(result).not.toContain('node_modules/');
    expect(result).not.toContain('.git/');
    expect(result).not.toContain('dist/');
  });

  it('includes an Existing Specs section listing IDs, titles, and statuses', async () => {
    const specContent = `---
spec_id: SDD-001
title: User login feature
status: ready
priority: high
complexity: medium
tags: [feature]
relevant_files: []
must_not_touch: []
depends_on: []
agent_skills: backend-dev
created: 2026-01-01
---
## Context
Some context.
`;
    mockListFiles.mockImplementation(async (pattern: string) => {
      if (pattern === '.specs/*.sdd.md') {
        return ['.specs/SDD-001-user-login-feature.sdd.md'];
      }
      return [];
    });
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.specs/SDD-001-user-login-feature.sdd.md') {
        return specContent;
      }
      return undefined;
    });

    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Existing Specs');
    expect(result).toContain('SDD-001');
    expect(result).toContain('User login feature');
    expect(result).toContain('ready');
  });

  it('shows a placeholder message when no existing specs are found', async () => {
    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Existing Specs');
    expect(result).toContain('No existing specs found');
  });

  it('includes Project Conventions section when conventions file exists', async () => {
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.sdd/conventions.md') {
        return '# Conventions\n\nUse TypeScript strict mode.';
      }
      return undefined;
    });

    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Project Conventions');
    expect(result).toContain('Use TypeScript strict mode.');
  });

  it('skips Project Conventions section when conventions file does not exist', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);

    const result = await assemblePlanContext(makeRequest());
    expect(result).not.toContain('## Project Conventions');
  });

  it('includes a Spec Format Reference section', async () => {
    const result = await assemblePlanContext(makeRequest());
    expect(result).toContain('## Spec Format Reference');
    expect(result).toContain('spec_id');
  });

  it('includes an Instructions section with the correct prefix and starting ID', async () => {
    const result = await assemblePlanContext(makeRequest({ existingSpecIds: ['SDD-001', 'SDD-002'] }));
    expect(result).toContain('## Instructions');
    expect(result).toContain('SDD');
    // Next ID after SDD-002 is SDD-003
    expect(result).toContain('SDD-003');
  });

  it('computes the starting ID using both filesystem specs and request.existingSpecIds', async () => {
    mockListFiles.mockImplementation(async (pattern: string) => {
      if (pattern === '.specs/*.sdd.md') {
        return ['.specs/SDD-005-something.sdd.md'];
      }
      return [];
    });
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.specs/SDD-005-something.sdd.md') {
        return `---
spec_id: SDD-005
title: Something
status: draft
priority: medium
complexity: medium
tags: []
relevant_files: []
must_not_touch: []
depends_on: []
agent_skills: backend-dev
created: 2026-01-01
---
`;
      }
      return undefined;
    });

    // existingSpecIds has SDD-003, but filesystem has SDD-005, so next should be SDD-006
    const result = await assemblePlanContext(makeRequest({ existingSpecIds: ['SDD-003'] }));
    expect(result).toContain('SDD-006');
  });

  it('includes a Refinement Feedback section when feedback is provided', async () => {
    const feedback = 'Please split the authentication spec into two separate specs.';
    const result = await assemblePlanContext(makeRequest({ feedback }));
    expect(result).toContain('## Refinement Feedback');
    expect(result).toContain(feedback);
  });

  it('does not include a Refinement Feedback section when feedback is not provided', async () => {
    const result = await assemblePlanContext(makeRequest());
    expect(result).not.toContain('## Refinement Feedback');
  });

  it('returns a document under 50 KB', async () => {
    const result = await assemblePlanContext(makeRequest());
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(50 * 1024);
  });

  it('truncates the document to 50 KB when content exceeds the limit', async () => {
    // Provide a massive repoTree to force truncation
    const hugeTree = 'x'.repeat(60 * 1024);
    const result = await assemblePlanContext(makeRequest({ repoTree: hugeTree }));
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(50 * 1024);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpecDocument } from '../specs/types';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
  fileExists: vi.fn().mockResolvedValue(false),
}));

import { assembleExecutionContext } from './contextAssembler';
import { readWorkspaceFile, fileExists } from '../utils/fileSystem';

const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockFileExists = vi.mocked(fileExists);

function makeSpec(overrides: Partial<SpecDocument> = {}): SpecDocument {
  return {
    frontmatter: {
      spec_id: 'SDD-024',
      title: 'Define execution types and implement context assembler',
      status: 'ready',
      priority: 'high',
      complexity: 'medium',
      tags: ['phase-2', 'backend'],
      relevant_files: ['src/execution/types.ts', 'src/execution/contextAssembler.ts'],
      must_not_touch: ['src/planning/planContextAssembler.ts'],
      depends_on: ['SDD-002', 'SDD-003'],
      budget_max_tokens: 100000,
      agent_skills: 'backend-dev',
      created: '2026-03-05',
    },
    context: 'This spec defines execution types and the context assembler.',
    functionalRequirements: '- Export ExecutionRecord, ExecutionConfig, LogEvent\n- Export assembleExecutionContext',
    nonFunctionalRequirements: '- Context must stay under 100KB',
    automatedCriteria: '- [ ] TypeScript compilation passes\n- [ ] Unit tests pass',
    manualCriteria: '- [ ] Context document provides sufficient information',
    constraints: 'Must use fileSystem utility for reading files',
    examples: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadWorkspaceFile.mockResolvedValue(undefined);
});

describe('assembleExecutionContext', () => {
  it('includes a Spec section with full spec content', async () => {
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('## Spec');
    expect(result).toContain('SDD-024');
    expect(result).toContain('Define execution types and implement context assembler');
  });

  it('includes Relevant Files section with file contents', async () => {
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === 'src/execution/types.ts') {
        return 'export interface ExecutionRecord {}';
      }
      if (path === 'src/execution/contextAssembler.ts') {
        return 'export async function assembleExecutionContext() {}';
      }
      return undefined;
    });

    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('## Relevant Files');
    expect(result).toContain('src/execution/types.ts');
    expect(result).toContain('export interface ExecutionRecord {}');
    expect(result).toContain('src/execution/contextAssembler.ts');
  });

  it('produces "File not found" note for missing relevant files instead of throwing', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);

    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('File not found: src/execution/types.ts');
    expect(result).toContain('File not found: src/execution/contextAssembler.ts');
  });

  it('includes Conventions section when conventions option is provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {
      conventions: '# Conventions\n\nUse TypeScript strict mode.',
    });
    expect(result).toContain('## Conventions');
    expect(result).toContain('Use TypeScript strict mode.');
  });

  it('includes Conventions section from filesystem when not provided in options', async () => {
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.sdd/conventions.md') {
        return '# Conventions\n\nAlways write tests.';
      }
      return undefined;
    });

    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('## Conventions');
    expect(result).toContain('Always write tests.');
  });

  it('skips Conventions section when no conventions are available', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).not.toContain('## Conventions');
  });

  it('includes Agent Skills section when skills option is provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {
      skills: '# Backend Dev Skills\n\nUse async/await patterns.',
    });
    expect(result).toContain('## Agent Skills');
    expect(result).toContain('Backend Dev Skills');
  });

  it('includes Agent Skills from filesystem when not provided in options', async () => {
    mockFileExists.mockImplementation(async (p: string) => p === '.sdd/skills/backend-dev.md');
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === '.sdd/skills/backend-dev.md') {
        return '# Backend Dev\n\nWrite clean code.';
      }
      return undefined;
    });

    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('## Agent Skills');
    expect(result).toContain('Write clean code.');
  });

  it('includes Scope Constraints section listing must_not_touch files', async () => {
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('## Scope Constraints');
    expect(result).toContain('Only modify files listed in relevant_files');
    expect(result).toContain('src/planning/planContextAssembler.ts');
  });

  it('includes Scope Constraints section without must_not_touch line when list is empty', async () => {
    const spec = makeSpec();
    spec.frontmatter.must_not_touch = [];
    const result = await assembleExecutionContext(spec, {});
    expect(result).toContain('## Scope Constraints');
    expect(result).toContain('Only modify files listed in relevant_files');
    expect(result).not.toContain('Do NOT modify:');
  });

  it('includes Previous Feedback section when feedback is provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {
      feedback: 'Please add error handling.',
    });
    expect(result).toContain('## Previous Feedback');
    expect(result).toContain('Please add error handling.');
  });

  it('includes previous output in Feedback section when provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {
      feedback: 'Add error handling.',
      previousOutput: 'The previous run produced this output.',
    });
    expect(result).toContain('## Previous Feedback');
    expect(result).toContain('Add error handling.');
    expect(result).toContain('The previous run produced this output.');
  });

  it('does not include Previous Feedback section when feedback is not provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).not.toContain('## Previous Feedback');
  });

  it('does not include previousOutput when feedback is not provided', async () => {
    const result = await assembleExecutionContext(makeSpec(), {
      previousOutput: 'Some output',
    });
    expect(result).not.toContain('## Previous Feedback');
    expect(result).not.toContain('Some output');
  });

  it('returns a document under 100 KB', async () => {
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(100 * 1024);
  });

  it('truncates the document to 100 KB when content exceeds the limit', async () => {
    const hugeContent = 'x'.repeat(110 * 1024);
    const result = await assembleExecutionContext(makeSpec(), {
      conventions: hugeContent,
    });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(100 * 1024);
  });

  it('includes all sections when all inputs are provided', async () => {
    mockReadWorkspaceFile.mockImplementation(async (path: string) => {
      if (path === 'src/execution/types.ts') {
        return 'export interface ExecutionRecord {}';
      }
      return undefined;
    });

    const result = await assembleExecutionContext(makeSpec(), {
      conventions: '# Conventions',
      skills: '# Skills',
      feedback: 'Fix the types.',
      previousOutput: 'Previous run output.',
    });

    expect(result).toContain('## Spec');
    expect(result).toContain('## Relevant Files');
    expect(result).toContain('## Conventions');
    expect(result).toContain('## Agent Skills');
    expect(result).toContain('## Scope Constraints');
    expect(result).toContain('## Previous Feedback');
  });
});

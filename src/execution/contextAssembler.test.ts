import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpecDocument } from '../specs/types';
import type { AIConfig } from '../config/aiConfigTypes';

vi.mock('../utils/fileSystem', () => ({
  readWorkspaceFile: vi.fn(),
}));

import { buildExecutionPrompt, assembleExecutionContext } from './contextAssembler';
import { readWorkspaceFile } from '../utils/fileSystem';

const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);

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

const REF = '@.specs/SDD-024.sdd.md';

const baseAiConfig: AIConfig = {
  provider: 'claude',
  permissionMode: 'default',
  model: 'sonnet',
  tagSkillMappings: [],
  prePromptTemplate: '',
  commitCommand: '',
  commitCommandEnabled: false,
  prCommand: '',
  prCommandEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadWorkspaceFile.mockResolvedValue(undefined);
});

describe('buildExecutionPrompt', () => {
  it('references the spec file without inlining its body', async () => {
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(result).toContain('## Spec');
    expect(result).toContain(REF);
    expect(result).not.toContain('This spec defines execution types');
  });

  it('inlines the spec when no specFileRef is given (deprecated alias)', async () => {
    const result = await assembleExecutionContext(makeSpec(), {});
    expect(result).toContain('SDD-024');
    expect(result).toContain('Define execution types and implement context assembler');
  });

  it('replaces {spec_file} in the pre-prompt with specFileRef', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      aiConfig: { ...baseAiConfig, prePromptTemplate: 'Implement {spec_file} now' },
    });
    expect(result).toContain(`## Instructions\n\nImplement ${REF} now`);
  });

  it('lists relevant files as paths only', async () => {
    mockReadWorkspaceFile.mockResolvedValue('FILE BODY');
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF, conventions: '' });
    expect(result).toContain('## Relevant Files');
    expect(result).toContain('- src/execution/types.ts');
    expect(result).toContain('- src/execution/contextAssembler.ts');
    expect(result).not.toContain('FILE BODY');
  });

  it('includes Conventions section when conventions option is provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
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

    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(result).toContain('## Conventions');
    expect(result).toContain('Always write tests.');
  });

  it('skips Conventions section when no conventions are available', async () => {
    mockReadWorkspaceFile.mockResolvedValue(undefined);
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(result).not.toContain('## Conventions');
  });

  it('includes Scope Constraints section listing must_not_touch files', async () => {
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(result).toContain('## Scope Constraints');
    expect(result).toContain('Only modify files listed in relevant_files');
    expect(result).toContain('src/planning/planContextAssembler.ts');
    expect(result).toContain('SDD verifies scope after the run');
  });

  it('includes Scope Constraints section without must_not_touch line when list is empty', async () => {
    const spec = makeSpec();
    spec.frontmatter.must_not_touch = [];
    const result = await buildExecutionPrompt(spec, { specFileRef: REF });
    expect(result).toContain('## Scope Constraints');
    expect(result).toContain('Only modify files listed in relevant_files');
    expect(result).not.toContain('Do NOT modify:');
  });

  it('includes Previous Feedback section when feedback is provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      feedback: 'Please add error handling.',
    });
    expect(result).toContain('## Previous Feedback');
    expect(result).toContain('Please add error handling.');
  });

  it('includes previous output in Feedback section when provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      feedback: 'Add error handling.',
      previousOutput: 'The previous run produced this output.',
    });
    expect(result).toContain('## Previous Feedback');
    expect(result).toContain('Add error handling.');
    expect(result).toContain('The previous run produced this output.');
  });

  it('does not include Previous Feedback section when feedback is not provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(result).not.toContain('## Previous Feedback');
  });

  it('does not include previousOutput when feedback is not provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      previousOutput: 'Some output',
    });
    expect(result).not.toContain('## Previous Feedback');
    expect(result).not.toContain('Some output');
  });

  it('returns a document under 100 KB', async () => {
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(100 * 1024);
  });

  it('truncates the document to 100 KB when content exceeds the limit', async () => {
    const hugeContent = 'x'.repeat(110 * 1024);
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      conventions: hugeContent,
    });
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(100 * 1024);
    expect(result.endsWith('\n\n[truncated by SDD]')).toBe(true);
  });

  it('truncates without splitting multi-byte characters', async () => {
    for (const filler of ['', 'a', 'ab', 'abc']) {
      const result = await buildExecutionPrompt(makeSpec(), {
        specFileRef: REF,
        conventions: filler + '😀'.repeat(30 * 1024),
      });
      expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(100 * 1024);
      expect(result).not.toContain('�');
      expect(Buffer.from(result, 'utf8').toString('utf8')).toBe(result);
    }
  });

  it('includes Post-Execution Commands section with both commands when both are enabled', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      aiConfig: {
        provider: 'claude',
        permissionMode: 'default',
        model: 'sonnet',
        tagSkillMappings: [],
        prePromptTemplate: '',
        commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
        commitCommandEnabled: true,
        prCommand: 'gh pr create --title "feat: {title} ({spec_id})" --body "Implements {spec_id}"',
        prCommandEnabled: true,
      },
    });
    expect(result).toContain('## Post-Execution Commands');
    expect(result).toContain('git add -A && git commit -m "SDD-024: Define execution types and implement context assembler"');
    expect(result).toContain('gh pr create --title "feat: Define execution types and implement context assembler (SDD-024)"');
  });

  it('includes Post-Execution Commands section with only commit when only commitCommand is enabled', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      aiConfig: {
        provider: 'claude',
        permissionMode: 'default',
        model: 'sonnet',
        tagSkillMappings: [],
        prePromptTemplate: '',
        commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
        commitCommandEnabled: true,
        prCommand: 'gh pr create --title "feat: {title} ({spec_id})"',
        prCommandEnabled: false,
      },
    });
    expect(result).toContain('## Post-Execution Commands');
    expect(result).toContain('git add -A && git commit -m "SDD-024:');
    expect(result).not.toContain('gh pr create');
  });

  it('does not include Post-Execution Commands section when both commands are disabled', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      aiConfig: {
        provider: 'claude',
        permissionMode: 'default',
        model: 'sonnet',
        tagSkillMappings: [],
        prePromptTemplate: '',
        commitCommand: 'git add -A && git commit -m "{spec_id}: {title}"',
        commitCommandEnabled: false,
        prCommand: 'gh pr create --title "feat: {title} ({spec_id})"',
        prCommandEnabled: false,
      },
    });
    expect(result).not.toContain('## Post-Execution Commands');
  });

  it('includes skill paths and extra instructions', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      skillPaths: ['.claude/skills/backend.md', '.claude/skills/ui.md'],
      extraInstructions: 'Retry: fix the failing test.',
    });
    expect(result).toContain('## Agent Skills');
    expect(result).toContain('- .claude/skills/backend.md');
    expect(result).toContain('- .claude/skills/ui.md');
    expect(result).toContain('## Additional Instructions\n\nRetry: fix the failing test.');
  });

  it('omits Agent Skills and Additional Instructions when not provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), { specFileRef: REF, skillPaths: [] });
    expect(result).not.toContain('## Agent Skills');
    expect(result).not.toContain('## Additional Instructions');
  });

  it('orders sections as specified when all inputs are provided', async () => {
    const result = await buildExecutionPrompt(makeSpec(), {
      specFileRef: REF,
      conventions: '# Conventions',
      skillPaths: ['skill.md'],
      feedback: 'Fix the types.',
      previousOutput: 'Previous run output.',
      extraInstructions: 'Extra.',
      aiConfig: {
        ...baseAiConfig,
        prePromptTemplate: 'Implement {spec_file}',
        commitCommand: 'git commit -m "{spec_id}"',
        commitCommandEnabled: true,
      },
    });

    const headings = [
      '## Instructions',
      '## Spec',
      '## Relevant Files',
      '## Conventions',
      '## Agent Skills',
      '## Scope Constraints',
      '## Post-Execution Commands',
      '## Previous Feedback',
      '## Additional Instructions',
    ];
    const positions = headings.map((h) => result.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });
});

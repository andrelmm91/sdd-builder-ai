import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn(),
  readWorkspaceFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  fileExists: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
}));

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
  isCommandAvailable: vi.fn(),
}));

vi.mock('./planContextAssembler', () => ({
  assemblePlanContext: vi.fn(),
}));

vi.mock('./specBatchWriter', () => ({
  parsePlannerOutput: vi.fn(),
  writeSpecBatch: vi.fn(),
}));

vi.mock('./dependencyResolver', () => ({
  validateDependencies: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as fileSystem from '../utils/fileSystem';
import * as shell from '../utils/shell';
import * as assembler from './planContextAssembler';
import * as batchWriter from './specBatchWriter';
import * as depResolver from './dependencyResolver';
import { PlannerOrchestrator } from './planner';
import type { PlanningRequest } from './types';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockGetWorkspaceRoot = vi.mocked(fileSystem.getWorkspaceRoot);
const mockReadWorkspaceFile = vi.mocked(fileSystem.readWorkspaceFile);
const mockWriteWorkspaceFile = vi.mocked(fileSystem.writeWorkspaceFile);
const mockFileExists = vi.mocked(fileSystem.fileExists);
const mockExecCommand = vi.mocked(shell.execCommand);
const mockIsCommandAvailable = vi.mocked(shell.isCommandAvailable);
const mockAssemblePlanContext = vi.mocked(assembler.assemblePlanContext);
const mockParsePlannerOutput = vi.mocked(batchWriter.parsePlannerOutput);
const mockWriteSpecBatch = vi.mocked(batchWriter.writeSpecBatch);
const mockValidateDependencies = vi.mocked(depResolver.validateDependencies);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE = '/workspace';

const SAMPLE_REQUEST: PlanningRequest = {
  requirements: 'Build a user authentication system with OAuth2 support.',
  existingSpecIds: [],
  projectPrefix: 'SDD',
};

const SAMPLE_SPEC = {
  specId: 'SDD-010',
  slug: 'user-auth',
  content: `---
spec_id: SDD-010
title: User Auth
status: draft
priority: high
complexity: medium
tags: []
relevant_files: []
must_not_touch: []
depends_on: []
budget_max_tokens: 100000
agent_skills: backend-dev
created: 2026-01-01
---
## Context
User authentication.`,
};

const CLAUDE_OUTPUT = `=== .specs/SDD-010-user-auth.sdd.md ===
${SAMPLE_SPEC.content}
`;

function makeSuccessExecResult(stdout = CLAUDE_OUTPUT) {
  return { stdout, stderr: '', exitCode: 0, success: true };
}

// ---------------------------------------------------------------------------
// Setup defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  mockGetWorkspaceRoot.mockReturnValue(WORKSPACE);
  mockWriteWorkspaceFile.mockResolvedValue(undefined);
  mockReadWorkspaceFile.mockResolvedValue(undefined); // no skills file by default
  mockIsCommandAvailable.mockResolvedValue(true);
  mockAssemblePlanContext.mockResolvedValue('assembled context');
  mockExecCommand.mockResolvedValue(makeSuccessExecResult());
  mockParsePlannerOutput.mockReturnValue([SAMPLE_SPEC]);
  mockWriteSpecBatch.mockResolvedValue({ written: ['.specs/SDD-010-user-auth.sdd.md'], errors: [] });
  mockValidateDependencies.mockReturnValue({ valid: true, errors: [] });
});

// ---------------------------------------------------------------------------
// PlannerOrchestrator – pipeline ordering
// ---------------------------------------------------------------------------

describe('PlannerOrchestrator', () => {
  describe('plan()', () => {
    it('returns a successful PlanningResult with generated specs', async () => {
      const orchestrator = new PlannerOrchestrator();
      const result = await orchestrator.plan(SAMPLE_REQUEST);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.specs).toHaveLength(1);
        expect(result.specs[0].specId).toBe('SDD-010');
      }
    });

    it('calls all pipeline steps in the correct order', async () => {
      const order: string[] = [];

      mockAssemblePlanContext.mockImplementation(async () => {
        order.push('assemblePlanContext');
        return 'context';
      });
      mockWriteWorkspaceFile.mockImplementation(async () => {
        order.push('writeWorkspaceFile');
      });
      mockIsCommandAvailable.mockImplementation(async () => {
        order.push('isCommandAvailable');
        return true;
      });
      mockExecCommand.mockImplementation(async (cmd: string) => {
        // Only track the Claude CLI call, not the cleanup rm call
        if (cmd.includes('claude')) {
          order.push('execCommand(claude)');
        }
        return makeSuccessExecResult();
      });
      mockParsePlannerOutput.mockImplementation(() => {
        order.push('parsePlannerOutput');
        return [SAMPLE_SPEC];
      });
      mockWriteSpecBatch.mockImplementation(async () => {
        order.push('writeSpecBatch');
        return { written: ['.specs/SDD-010-user-auth.sdd.md'], errors: [] };
      });
      mockValidateDependencies.mockImplementation(() => {
        order.push('validateDependencies');
        return { valid: true, errors: [] };
      });

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      expect(order).toEqual([
        'assemblePlanContext',
        'writeWorkspaceFile',
        'isCommandAvailable',
        'execCommand(claude)',
        'parsePlannerOutput',
        'writeSpecBatch',
        'validateDependencies',
      ]);
    });

    it('passes the assembled context to writeWorkspaceFile at .sdd/plan-context.md', async () => {
      mockAssemblePlanContext.mockResolvedValue('the context body');
      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(mockWriteWorkspaceFile).toHaveBeenCalledWith('.sdd/plan-context.md', 'the context body');
    });

    it('cleans up the context file after Claude CLI execution', async () => {
      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      const rmCalls = mockExecCommand.mock.calls.filter(([cmd]) =>
        (cmd as string).includes('rm -f')
      );
      expect(rmCalls.length).toBeGreaterThanOrEqual(1);
      expect(rmCalls[0][0]).toContain('plan-context.md');
    });

    it('cleans up the context file even when Claude CLI fails', async () => {
      mockExecCommand.mockImplementation(async (cmd: string) => {
        if ((cmd as string).includes('claude')) {
          return { stdout: '', stderr: 'API error', exitCode: 1, success: false };
        }
        return makeSuccessExecResult('');
      });

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      const rmCalls = mockExecCommand.mock.calls.filter(([cmd]) =>
        (cmd as string).includes('rm -f')
      );
      expect(rmCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('invokes parsePlannerOutput with the CLI stdout', async () => {
      mockExecCommand.mockResolvedValue(makeSuccessExecResult('cli response text'));
      mockParsePlannerOutput.mockReturnValue([SAMPLE_SPEC]);

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      expect(mockParsePlannerOutput).toHaveBeenCalledWith('cli response text');
    });

    it('passes the workspace root to writeSpecBatch', async () => {
      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(mockWriteSpecBatch).toHaveBeenCalledWith([SAMPLE_SPEC], WORKSPACE);
    });

    it('fires progress callbacks at each stage', async () => {
      const messages: string[] = [];
      await new PlannerOrchestrator((msg) => messages.push(msg)).plan(SAMPLE_REQUEST);

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => /context/i.test(m))).toBe(true);
      expect(messages.some((m) => /claude/i.test(m))).toBe(true);
      expect(messages.some((m) => /spec/i.test(m))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // refine()
  // -------------------------------------------------------------------------

  describe('refine()', () => {
    it('returns a successful PlanningResult, same as plan()', async () => {
      const result = await new PlannerOrchestrator().refine({
        ...SAMPLE_REQUEST,
        feedback: 'Split the auth spec into two.',
      });

      expect(result.success).toBe(true);
    });

    it('passes feedback through to assemblePlanContext via the request object', async () => {
      const feedback = 'Split the auth spec into two.';
      await new PlannerOrchestrator().refine({ ...SAMPLE_REQUEST, feedback });
      expect(mockAssemblePlanContext).toHaveBeenCalledWith(
        expect.objectContaining({ feedback })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('returns an error when requirements is empty', async () => {
      const result = await new PlannerOrchestrator().plan({ ...SAMPLE_REQUEST, requirements: '' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/empty/i);
    });

    it('returns an error when requirements is only whitespace', async () => {
      const result = await new PlannerOrchestrator().plan({ ...SAMPLE_REQUEST, requirements: '   ' });
      expect(result.success).toBe(false);
    });

    it('returns an error when requirements are too short', async () => {
      const result = await new PlannerOrchestrator().plan({ ...SAMPLE_REQUEST, requirements: 'hi' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/short/i);
    });

    it('returns an error when requirements exceed 10 000 characters', async () => {
      const result = await new PlannerOrchestrator().plan({
        ...SAMPLE_REQUEST,
        requirements: 'x'.repeat(10_001),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/length|characters/i);
    });

    it('does not invoke assemblePlanContext when validation fails', async () => {
      await new PlannerOrchestrator().plan({ ...SAMPLE_REQUEST, requirements: '' });
      expect(mockAssemblePlanContext).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Workspace not open
  // -------------------------------------------------------------------------

  describe('no workspace', () => {
    it('returns an error when there is no open workspace', async () => {
      mockGetWorkspaceRoot.mockReturnValue(undefined);
      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/workspace/i);
    });
  });

  // -------------------------------------------------------------------------
  // Claude CLI errors
  // -------------------------------------------------------------------------

  describe('Claude CLI failure', () => {
    it('returns a meaningful error when Claude CLI is not installed', async () => {
      mockIsCommandAvailable.mockResolvedValue(false);
      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/not installed|not found/i);
      }
    });

    it('returns a meaningful error when Claude CLI exits with a non-zero code', async () => {
      mockExecCommand.mockImplementation(async (cmd: string) => {
        if ((cmd as string).includes('claude')) {
          return { stdout: '', stderr: 'network failure', exitCode: 1, success: false };
        }
        return makeSuccessExecResult('');
      });

      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/failed|network failure/i);
      }
    });

    it('returns a timeout error when Claude CLI is killed after 5 minutes', async () => {
      mockExecCommand.mockImplementation(async (cmd: string) => {
        if ((cmd as string).includes('claude')) {
          return { stdout: '', stderr: 'Command timed out after 300000ms', exitCode: 124, success: false };
        }
        return makeSuccessExecResult('');
      });

      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/timed? ?out/i);
      }
    });

    it('returns an error when parsePlannerOutput returns no specs', async () => {
      mockParsePlannerOutput.mockReturnValue([]);
      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/no spec/i);
      }
    });

    it('returns an error when all spec writes fail', async () => {
      mockWriteSpecBatch.mockResolvedValue({
        written: [],
        errors: [{ specId: 'SDD-010', error: 'disk full' }],
      });

      const result = await new PlannerOrchestrator().plan(SAMPLE_REQUEST);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/failed/i);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Skills file lookup
  // -------------------------------------------------------------------------

  describe('skills file', () => {
    it('includes --system-prompt flag when a skills file is found', async () => {
      mockFileExists.mockImplementation(async (p: string) => p === '.sdd/skills/sdd-planner.md');
      mockReadWorkspaceFile.mockImplementation(async (p: string) => {
        if (p === '.sdd/skills/sdd-planner.md') return '# SDD Planner skills';
        return undefined;
      });

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      const claudeCall = mockExecCommand.mock.calls.find(([cmd]) =>
        (cmd as string).includes('claude')
      );
      expect(claudeCall).toBeDefined();
      expect(claudeCall![0]).toContain('--system-prompt');
    });

    it('omits --system-prompt flag when no skills file is found', async () => {
      mockFileExists.mockResolvedValue(false);
      mockReadWorkspaceFile.mockResolvedValue(undefined);

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      const claudeCall = mockExecCommand.mock.calls.find(([cmd]) =>
        (cmd as string).includes('claude')
      );
      expect(claudeCall).toBeDefined();
      expect(claudeCall![0]).not.toContain('--system-prompt');
    });

    it('checks .claude/skills/sdd-planner.md as a fallback', async () => {
      mockFileExists.mockImplementation(async (p: string) => p === '.claude/skills/sdd-planner.md');
      mockReadWorkspaceFile.mockImplementation(async (p: string) => {
        if (p === '.claude/skills/sdd-planner.md') return '# fallback skills';
        return undefined;
      });

      await new PlannerOrchestrator().plan(SAMPLE_REQUEST);

      const claudeCall = mockExecCommand.mock.calls.find(([cmd]) =>
        (cmd as string).includes('claude')
      );
      expect(claudeCall![0]).toContain('--system-prompt');
    });
  });
});


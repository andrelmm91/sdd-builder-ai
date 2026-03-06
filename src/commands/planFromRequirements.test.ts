import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('vscode', () => {
  const progressToken = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
  };

  class RelativePattern {
    constructor(public base: unknown, public pattern: string) {}
  }

  return {
    window: {
      showInputBox: vi.fn(),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showTextDocument: vi.fn(),
      withProgress: vi.fn(async (_opts: unknown, task: (p: unknown, t: typeof progressToken) => Promise<void>) => {
        await task({ report: vi.fn() }, progressToken);
      }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      findFiles: vi.fn(),
    },
    ProgressLocation: { Notification: 15 },
    RelativePattern,
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => p }),
    },
  };
});

const mockPlanFn = vi.fn();

vi.mock('../planning/planner', () => ({
  PlannerOrchestrator: vi.fn().mockImplementation(function() {
    return { plan: mockPlanFn };
  }),
}));

vi.mock('../config/extensionConfig', () => ({
  getSpecPrefix: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { PlannerOrchestrator } from '../planning/planner';
import { getSpecPrefix } from '../config/extensionConfig';
import { planFromRequirements } from './planFromRequirements';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockShowInputBox = vi.mocked(vscode.window.showInputBox);
const mockShowInformationMessage = vi.mocked(vscode.window.showInformationMessage);
const mockShowErrorMessage = vi.mocked(vscode.window.showErrorMessage);
const mockShowTextDocument = vi.mocked(vscode.window.showTextDocument);
const mockFindFiles = vi.mocked(vscode.workspace.findFiles);
const MockPlannerOrchestrator = vi.mocked(PlannerOrchestrator);
const mockGetSpecPrefix = vi.mocked(getSpecPrefix);

const SAMPLE_SPEC = { specId: 'SDD-010', slug: 'user-auth', content: '---\n---\n' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('planFromRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpecPrefix.mockResolvedValue('SDD');
    mockFindFiles.mockResolvedValue([]);
    mockShowTextDocument.mockResolvedValue(undefined as never);
    mockPlanFn.mockResolvedValue({ success: true, specs: [] });
    MockPlannerOrchestrator.mockImplementation(function() {
      return { plan: mockPlanFn };
    });
  });

  it('does nothing when the user cancels the input box', async () => {
    mockShowInputBox.mockResolvedValue(undefined);
    await planFromRequirements();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('does nothing when the user submits an empty string', async () => {
    mockShowInputBox.mockResolvedValue('');
    await planFromRequirements();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('calls PlannerOrchestrator.plan() with the entered requirements', async () => {
    const requirements = 'Build a user authentication system.';
    mockShowInputBox.mockResolvedValue(requirements);

    await planFromRequirements();

    expect(mockPlanFn).toHaveBeenCalledWith(
      expect.objectContaining({ requirements })
    );
  });

  it('passes gathered existingSpecIds to the planner', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/.specs/SDD-001-foo.sdd.md' } as never,
      { fsPath: '/workspace/.specs/SDD-002-bar.sdd.md' } as never,
    ]);

    await planFromRequirements();

    expect(mockPlanFn).toHaveBeenCalledWith(
      expect.objectContaining({ existingSpecIds: expect.arrayContaining(['SDD-001', 'SDD-002']) })
    );
  });

  it('passes the project prefix to the planner', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');
    mockGetSpecPrefix.mockResolvedValue('PROJ');

    await planFromRequirements();

    expect(mockPlanFn).toHaveBeenCalledWith(
      expect.objectContaining({ projectPrefix: 'PROJ' })
    );
  });

  it('opens generated spec files in editor tabs on success', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');
    mockPlanFn.mockResolvedValue({ success: true, specs: [SAMPLE_SPEC] });

    await planFromRequirements();

    expect(mockShowTextDocument).toHaveBeenCalledOnce();
    const [uri] = mockShowTextDocument.mock.calls[0];
    expect((uri as { fsPath: string }).fsPath).toContain('SDD-010-user-auth.sdd.md');
  });

  it('shows an info message with the spec count on success', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');
    mockPlanFn.mockResolvedValue({ success: true, specs: [SAMPLE_SPEC, SAMPLE_SPEC] });

    await planFromRequirements();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('2 spec(s)')
    );
  });

  it('shows an error message when planning fails', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');
    mockPlanFn.mockResolvedValue({ success: false, error: 'Claude CLI failed' });

    await planFromRequirements();

    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Claude CLI failed')
    );
    expect(mockShowTextDocument).not.toHaveBeenCalled();
  });

  it('shows an info message when planning is cancelled', async () => {
    mockShowInputBox.mockResolvedValue('Build something.');

    vi.mocked(vscode.window.withProgress).mockImplementationOnce(
      async (_opts: unknown, task: (p: unknown, t: unknown) => Promise<void>) => {
        const progress = { report: vi.fn() };
        const token = {
          isCancellationRequested: true,
          onCancellationRequested: (cb: () => void) => { cb(); return { dispose: vi.fn() }; },
        };
        mockPlanFn.mockReturnValue(new Promise(() => { /* never resolves */ }));
        await task(progress, token);
      }
    );

    await planFromRequirements();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('cancelled')
    );
  });
});

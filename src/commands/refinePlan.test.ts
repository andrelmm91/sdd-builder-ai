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

const mockRefineFn = vi.fn();

vi.mock('../planning/planner', () => ({
  PlannerOrchestrator: vi.fn().mockImplementation(function() {
    return { refine: mockRefineFn };
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
import { refinePlan } from './refinePlan';

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

const SAMPLE_SPEC = { specId: 'SDD-011', slug: 'split-auth', content: '---\n---\n' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refinePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpecPrefix.mockResolvedValue('SDD');
    mockFindFiles.mockResolvedValue([]);
    mockShowTextDocument.mockResolvedValue(undefined as never);
    mockRefineFn.mockResolvedValue({ success: true, specs: [] });
    MockPlannerOrchestrator.mockImplementation(function() {
      return { refine: mockRefineFn };
    });
  });

  it('does nothing when the user cancels the requirements input box', async () => {
    mockShowInputBox.mockResolvedValueOnce(undefined);
    await refinePlan();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('does nothing when the user cancels the feedback input box', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce(undefined);
    await refinePlan();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('does nothing when requirements is an empty string', async () => {
    mockShowInputBox.mockResolvedValueOnce('');
    await refinePlan();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('does nothing when feedback is an empty string', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('');
    await refinePlan();
    expect(MockPlannerOrchestrator).not.toHaveBeenCalled();
  });

  it('calls PlannerOrchestrator.refine() with requirements and feedback', async () => {
    const requirements = 'Build a user authentication system.';
    const feedback = 'Split the auth spec into two separate specs.';
    mockShowInputBox.mockResolvedValueOnce(requirements);
    mockShowInputBox.mockResolvedValueOnce(feedback);

    await refinePlan();

    expect(mockRefineFn).toHaveBeenCalledWith(
      expect.objectContaining({ requirements, feedback })
    );
  });

  it('passes gathered existingSpecIds to the planner', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('Add more detail.');
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/.specs/SDD-001-foo.sdd.md' } as never,
    ]);

    await refinePlan();

    expect(mockRefineFn).toHaveBeenCalledWith(
      expect.objectContaining({ existingSpecIds: ['SDD-001'] })
    );
  });

  it('opens generated spec files in editor tabs on success', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('Add more detail.');
    mockRefineFn.mockResolvedValue({ success: true, specs: [SAMPLE_SPEC] });

    await refinePlan();

    expect(mockShowTextDocument).toHaveBeenCalledOnce();
    const [uri] = mockShowTextDocument.mock.calls[0];
    expect((uri as { fsPath: string }).fsPath).toContain('SDD-011-split-auth.sdd.md');
  });

  it('shows an info message with the spec count on success', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('Add more detail.');
    mockRefineFn.mockResolvedValue({ success: true, specs: [SAMPLE_SPEC] });

    await refinePlan();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 spec(s)')
    );
  });

  it('shows an error message when refinement fails', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('Add more detail.');
    mockRefineFn.mockResolvedValue({ success: false, error: 'Claude CLI not installed' });

    await refinePlan();

    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Claude CLI not installed')
    );
    expect(mockShowTextDocument).not.toHaveBeenCalled();
  });

  it('shows an info message when refinement is cancelled', async () => {
    mockShowInputBox.mockResolvedValueOnce('Build something.');
    mockShowInputBox.mockResolvedValueOnce('Add more detail.');

    vi.mocked(vscode.window.withProgress).mockImplementationOnce(
      async (_opts: unknown, task: (p: unknown, t: unknown) => Promise<void>) => {
        const progress = { report: vi.fn() };
        const token = {
          isCancellationRequested: true,
          onCancellationRequested: (cb: () => void) => { cb(); return { dispose: vi.fn() }; },
        };
        mockRefineFn.mockReturnValue(new Promise(() => { /* never resolves */ }));
        await task(progress, token);
      }
    );

    await refinePlan();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('cancelled')
    );
  });
});

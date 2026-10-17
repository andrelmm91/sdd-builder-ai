import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import {
  setActiveRequirementsTerminal,
  completeCurrentRequirementsExecution,
  cancelCurrentRequirementsExecution,
} from './requirementsRunner';

function makeTerminal() {
  return { dispose: vi.fn() } as unknown as vscode.Terminal & { dispose: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  setActiveRequirementsTerminal(null);
});

describe('requirementsRunner', () => {
  it('complete disposes the terminal without calling onCancel', () => {
    const terminal = makeTerminal();
    const onCancel = vi.fn();
    setActiveRequirementsTerminal(terminal, onCancel);

    completeCurrentRequirementsExecution();

    expect(terminal.dispose).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancel calls onCancel and disposes the terminal', () => {
    const terminal = makeTerminal();
    const onCancel = vi.fn();
    setActiveRequirementsTerminal(terminal, onCancel);

    cancelCurrentRequirementsExecution();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(terminal.dispose).toHaveBeenCalledOnce();
  });

  it('clears state so a second complete/cancel is a no-op', () => {
    const terminal = makeTerminal();
    const onCancel = vi.fn();
    setActiveRequirementsTerminal(terminal, onCancel);

    cancelCurrentRequirementsExecution();
    cancelCurrentRequirementsExecution();
    completeCurrentRequirementsExecution();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(terminal.dispose).toHaveBeenCalledOnce();
  });

  it('does not call a stale onCancel after complete', () => {
    const onCancel = vi.fn();
    setActiveRequirementsTerminal(makeTerminal(), onCancel);
    completeCurrentRequirementsExecution();
    cancelCurrentRequirementsExecution();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('replacing the terminal drops the previous onCancel', () => {
    const first = vi.fn();
    const second = makeTerminal();
    setActiveRequirementsTerminal(makeTerminal(), first);
    setActiveRequirementsTerminal(second);

    cancelCurrentRequirementsExecution();

    expect(first).not.toHaveBeenCalled();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('is safe to call with no active terminal', () => {
    expect(() => {
      completeCurrentRequirementsExecution();
      cancelCurrentRequirementsExecution();
    }).not.toThrow();
  });
});

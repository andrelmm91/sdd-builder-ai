import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../test/setup';
import { BulkExecutionManager } from './bulkExecution';

// Build a valid ready-spec file content string
const READY_SPEC = `---
spec_id: SDD-AAA
title: Test Spec
status: ready
priority: medium
complexity: low
tags: []
relevant_files: []
must_not_touch: []
depends_on: []
budget_max_tokens: 50000
agent_skills: backend-dev
created: 2026-01-01
---

## Context
Test context.

## Requirements
### Functional
- Do something

## Acceptance Criteria
### Automated
- [ ] Tests pass

## Constraints
- None
`;

const DRAFT_SPEC = READY_SPEC.replace('status: ready', 'status: draft');

function makeFileContent(specId: string, status: string): Uint8Array {
  const content = READY_SPEC
    .replace('spec_id: SDD-AAA', `spec_id: ${specId}`)
    .replace('status: ready', `status: ${status}`);
  return Buffer.from(content, 'utf8');
}

describe('BulkExecutionManager', () => {
  beforeEach(() => {
    BulkExecutionManager._resetForTesting();
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('returns the same singleton instance', () => {
      const a = BulkExecutionManager.getInstance();
      const b = BulkExecutionManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('addSpec', () => {
    it('adds a ready spec to the queue', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      const added = await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      expect(added).toBe(true);
      const queue = manager.getQueue();
      expect(queue.items).toHaveLength(1);
      expect(queue.items[0]).toEqual({ specId: 'SDD-001', status: 'queued' });
    });

    it('rejects a non-ready spec', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'draft'));

      const manager = BulkExecutionManager.getInstance();
      const added = await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      expect(added).toBe(false);
      expect(manager.getQueue().items).toHaveLength(0);
    });

    it('rejects a spec already in the queue', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');
      const added = await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      expect(added).toBe(false);
      expect(manager.getQueue().items).toHaveLength(1);
    });

    it('rejects when file read fails', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockRejectedValue(new Error('not found'));

      const manager = BulkExecutionManager.getInstance();
      const added = await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      expect(added).toBe(false);
    });

    it('fires state change on successful add', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      const emitter = (manager as unknown as { stateChangeEmitter: { fire: ReturnType<typeof vi.fn> } }).stateChangeEmitter;

      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      expect(emitter.fire).toHaveBeenCalledOnce();
    });
  });

  describe('removeSpec', () => {
    beforeEach(async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));
      await BulkExecutionManager.getInstance().addSpec('SDD-001', '/specs/SDD-001.sdd.md');
    });

    it('removes a queued spec', () => {
      const manager = BulkExecutionManager.getInstance();
      const removed = manager.removeSpec('SDD-001');
      expect(removed).toBe(true);
      expect(manager.getQueue().items).toHaveLength(0);
    });

    it('returns false for unknown specId', () => {
      const removed = BulkExecutionManager.getInstance().removeSpec('SDD-999');
      expect(removed).toBe(false);
    });

    it('prevents removal of an executing spec', () => {
      const manager = BulkExecutionManager.getInstance() as unknown as {
        items: Array<{ specId: string; status: string }>;
        isRunning: boolean;
        currentIndex: number;
      };
      // Simulate running state with SDD-001 executing
      manager.isRunning = true;
      manager.currentIndex = 0;
      manager.items[0].status = 'executing';

      const removed = (BulkExecutionManager.getInstance() as BulkExecutionManager).removeSpec('SDD-001');
      expect(removed).toBe(false);
    });

    it('fires state change on successful remove', () => {
      const manager = BulkExecutionManager.getInstance();
      const emitter = (manager as unknown as { stateChangeEmitter: { fire: ReturnType<typeof vi.fn> } }).stateChangeEmitter;
      emitter.fire.mockClear();

      manager.removeSpec('SDD-001');
      expect(emitter.fire).toHaveBeenCalledOnce();
    });
  });

  describe('isInBulk', () => {
    it('returns false for empty queue', () => {
      expect(BulkExecutionManager.getInstance().isInBulk('SDD-001')).toBe(false);
    });

    it('returns true after adding', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');
      expect(manager.isInBulk('SDD-001')).toBe(true);
    });

    it('returns false after removing', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');
      manager.removeSpec('SDD-001');
      expect(manager.isInBulk('SDD-001')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all items when not running', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile)
        .mockResolvedValueOnce(makeFileContent('SDD-001', 'ready'))
        .mockResolvedValueOnce(makeFileContent('SDD-002', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');
      await manager.addSpec('SDD-002', '/specs/SDD-002.sdd.md');

      const cleared = manager.clear();
      expect(cleared).toBe(true);
      expect(manager.getQueue().items).toHaveLength(0);
    });

    it('refuses to clear while running', () => {
      const manager = BulkExecutionManager.getInstance() as unknown as { isRunning: boolean };
      manager.isRunning = true;

      const cleared = (BulkExecutionManager.getInstance() as BulkExecutionManager).clear();
      expect(cleared).toBe(false);
    });

    it('fires state change on clear', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValue(makeFileContent('SDD-001', 'ready'));

      const manager = BulkExecutionManager.getInstance();
      await manager.addSpec('SDD-001', '/specs/SDD-001.sdd.md');

      const emitter = (manager as unknown as { stateChangeEmitter: { fire: ReturnType<typeof vi.fn> } }).stateChangeEmitter;
      emitter.fire.mockClear();

      manager.clear();
      expect(emitter.fire).toHaveBeenCalledOnce();
    });
  });

  describe('executeAll', () => {
    async function addReadySpec(specId: string): Promise<void> {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readFile).mockResolvedValueOnce(makeFileContent(specId, 'ready'));
      await BulkExecutionManager.getInstance().addSpec(specId, `/specs/${specId}.sdd.md`);
    }

    it('runs all specs sequentially on success', async () => {
      await addReadySpec('SDD-001');
      await addReadySpec('SDD-002');

      const order: string[] = [];
      const executeFn = vi.fn(async (specId: string) => {
        order.push(specId);
        return true;
      });

      await BulkExecutionManager.getInstance().executeAll(executeFn);

      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(order).toEqual(['SDD-001', 'SDD-002']);
    });

    it('stops after first failure', async () => {
      await addReadySpec('SDD-001');
      await addReadySpec('SDD-002');
      await addReadySpec('SDD-003');

      const executeFn = vi.fn(async (specId: string) => specId !== 'SDD-002');

      await BulkExecutionManager.getInstance().executeAll(executeFn);

      expect(executeFn).toHaveBeenCalledTimes(2); // SDD-001 and SDD-002 only
      const queue = BulkExecutionManager.getInstance().getQueue();
      expect(queue.items[0].status).toBe('completed');
      expect(queue.items[1].status).toBe('failed');
      expect(queue.items[2].status).toBe('queued'); // never reached
    });

    it('marks item failed when executeFn throws', async () => {
      await addReadySpec('SDD-001');

      const executeFn = vi.fn(async () => { throw new Error('boom'); });

      await BulkExecutionManager.getInstance().executeAll(executeFn);

      const queue = BulkExecutionManager.getInstance().getQueue();
      expect(queue.items[0].status).toBe('failed');
      expect(queue.isRunning).toBe(false);
    });

    it('resets isRunning and currentIndex after completion', async () => {
      await addReadySpec('SDD-001');
      const executeFn = vi.fn(async () => true);

      await BulkExecutionManager.getInstance().executeAll(executeFn);

      const queue = BulkExecutionManager.getInstance().getQueue();
      expect(queue.isRunning).toBe(false);
      expect(queue.currentIndex).toBe(-1);
    });

    it('stops early when cancel() is called', async () => {
      await addReadySpec('SDD-001');
      await addReadySpec('SDD-002');

      const manager = BulkExecutionManager.getInstance();
      const executeFn = vi.fn(async () => {
        manager.cancel();
        return true;
      });

      await manager.executeAll(executeFn);

      // cancel() sets flag after first spec — second spec never executes
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('does not start if already running', async () => {
      await addReadySpec('SDD-001');
      const manager = BulkExecutionManager.getInstance() as unknown as { isRunning: boolean };
      manager.isRunning = true;

      const executeFn = vi.fn(async () => true);
      await (BulkExecutionManager.getInstance() as BulkExecutionManager).executeAll(executeFn);

      expect(executeFn).not.toHaveBeenCalled();
    });

    it('fires state change events during execution', async () => {
      await addReadySpec('SDD-001');

      const manager = BulkExecutionManager.getInstance();
      const emitter = (manager as unknown as { stateChangeEmitter: { fire: ReturnType<typeof vi.fn> } }).stateChangeEmitter;
      emitter.fire.mockClear();

      const executeFn = vi.fn(async () => true);
      await manager.executeAll(executeFn);

      // Fires: start, before-exec, after-exec, done = 4 times for 1 item
      expect(emitter.fire).toHaveBeenCalledTimes(4);
    });
  });
});

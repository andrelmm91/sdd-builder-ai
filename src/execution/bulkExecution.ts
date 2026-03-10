import * as vscode from 'vscode';
import { parseSpec } from '../specs/parser';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import type { BulkExecutionItem, BulkExecutionState } from './types';

export class BulkExecutionManager {
  private static instance: BulkExecutionManager | undefined;

  private items: BulkExecutionItem[] = [];
  private filePaths = new Map<string, string>();
  private isRunning = false;
  private currentIndex = -1;
  private cancelled = false;

  private stateChangeEmitter = new vscode.EventEmitter<BulkExecutionState>();
  readonly onStateChange = this.stateChangeEmitter.event;

  private constructor() {}

  static getInstance(): BulkExecutionManager {
    if (!BulkExecutionManager.instance) {
      BulkExecutionManager.instance = new BulkExecutionManager();
    }
    return BulkExecutionManager.instance;
  }

  /** For testing only — resets the singleton state. */
  static _resetForTesting(): void {
    BulkExecutionManager.instance = undefined;
  }

  async addSpec(specId: string, filePath: string): Promise<boolean> {
    if (this.isInBulk(specId)) return false;

    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const result = parseSpec(content);
      if (!result.success || result.data.frontmatter.status !== 'ready') {
        return false;
      }
    } catch {
      return false;
    }

    this.items.push({ specId, status: 'queued' });
    this.filePaths.set(specId, filePath);
    this.fireStateChange();
    return true;
  }

  removeSpec(specId: string): boolean {
    const item = this.items.find((i) => i.specId === specId);
    if (!item) return false;
    if (item.status === 'executing') return false;
    if (this.isRunning) return false;

    const idx = this.items.findIndex((i) => i.specId === specId);
    this.items.splice(idx, 1);
    this.filePaths.delete(specId);
    this.fireStateChange();
    return true;
  }

  getQueue(): BulkExecutionState {
    return {
      items: this.items.map((item) => ({ ...item })),
      isRunning: this.isRunning,
      currentIndex: this.currentIndex,
    };
  }

  isInBulk(specId: string): boolean {
    return this.items.some((item) => item.specId === specId);
  }

  clear(): boolean {
    if (this.isRunning) return false;
    this.items = [];
    this.filePaths.clear();
    this.currentIndex = -1;
    this.fireStateChange();
    return true;
  }

  getFilePath(specId: string): string | undefined {
    return this.filePaths.get(specId);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async executeAll(executeFn: (specId: string) => Promise<boolean>): Promise<void> {
    if (this.isRunning || this.items.length === 0) return;

    this.isRunning = true;
    this.cancelled = false;
    this.currentIndex = 0;
    this.fireStateChange();

    for (let i = 0; i < this.items.length; i++) {
      if (this.cancelled) break;

      this.currentIndex = i;
      this.items[i] = { ...this.items[i], status: 'executing' };
      this.fireStateChange();

      try {
        const success = await executeFn(this.items[i].specId);
        this.items[i] = { ...this.items[i], status: success ? 'completed' : 'failed' };
      } catch {
        this.items[i] = { ...this.items[i], status: 'failed' };
        // If executeFn threw without reverting the spec status, attempt a best-effort revert here.
        const fp = this.filePaths.get(this.items[i].specId);
        if (fp) {
          try {
            const uri = vscode.Uri.file(fp);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(bytes).toString('utf8');
            const { data, body } = parseFrontmatter(content);
            if (data['status'] === 'in_progress') {
              data['status'] = 'ready';
              const updated = serializeFrontmatter(data, body);
              await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));
            }
          } catch {
            // best-effort revert
          }
        }
      }
      this.fireStateChange();

      if (this.items[i].status === 'failed') break;
    }

    this.isRunning = false;
    this.currentIndex = -1;
    this.fireStateChange();
  }

  private fireStateChange(): void {
    this.stateChangeEmitter.fire(this.getQueue());
  }
}

export interface SpecSummary {
  spec_id: string;
  title: string;
  status: string;
  priority: string;
  complexity: string;
  tags: string[];
}

export interface BulkExecutionItem {
  specId: string;
  status: 'queued' | 'executing' | 'done' | 'failed';
  error?: string;
}

export interface BulkExecutionState {
  items: BulkExecutionItem[];
  isRunning: boolean;
}

export type WebviewMessage =
  | { type: 'specList'; data: { specs: SpecSummary[] } }
  | { type: 'specUpdate'; data: { specId: string; status: string } }
  | { type: 'dashboardData'; data: { total: number; byStatus: Record<string, number> } }
  | { type: 'kanbanMove'; data: { specId: string; fromStatus: string; toStatus: string } }
  | { type: 'navigate'; data: { route: string; params?: Record<string, string> } }
  | { type: 'bulkState'; data: BulkExecutionState };

export interface SpecSummary {
  spec_id: string;
  title: string;
  status: string;
  priority: string;
  complexity: string;
  tags: string[];
  changedFiles?: string[];
}

export interface ProviderOption {
  id: string;
  label: string;
  models: string[];
  permissionModes: { id: string; label: string; mode: 'batch' | 'interactive' }[];
}

/** Raw provider definition as stored in `ai.customProviders` (mirrors src/config/providerTypes.ts). */
export interface ProviderDefinition {
  id: string;
  label: string;
  binary: string;
  fileRefFormat: string;
  batch?: { args: string[] };
  interactive?: { args: string[] };
  modelArgs?: string[];
  models?: string[];
  permissionModes: { id: string; label: string; mode: 'batch' | 'interactive'; extraArgs?: string[] }[];
}

export interface ProviderValidation {
  index: number;
  errors: { path: string; message: string }[];
  previews: { modeId: string; label: string; command: string }[];
  binaryFound: boolean;
}

export interface BulkExecutionItem {
  specId: string;
  status: 'queued' | 'executing' | 'completed' | 'failed';
}

export interface BulkExecutionState {
  items: BulkExecutionItem[];
  isRunning: boolean;
  currentIndex: number;
}

export type WebviewMessage =
  | { type: 'specList'; data: { specs: SpecSummary[] } }
  | { type: 'specUpdate'; data: { specId: string; status: string } }
  | { type: 'dashboardData'; data: { total: number; byStatus: Record<string, number> } }
  | { type: 'kanbanMove'; data: { specId: string; fromStatus: string; toStatus: string } }
  | { type: 'navigate'; data: { route: string; params?: Record<string, string> } }
  | { type: 'bulkState'; data: BulkExecutionState };

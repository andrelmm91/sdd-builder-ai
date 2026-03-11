export interface ExecutionRecord {
  specId: string;
  executionNumber: number;
  timestamp: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  duration: number;
  testsPassed: boolean | null;
  prUrl: string | null;
  changedFiles?: string[];
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}

export interface ExecutionRunner {
  execute(spec: import('../specs/types').SpecDocument, config: ExecutionConfig, aiConfig?: Partial<import('../config/aiConfigTypes').AIConfig>, specFilePath?: string): Promise<ExecutionResult>;
  abort(): void;
  /** For interactive modes: dispose the terminal to signal completion (does not set the abort flag). */
  completeInteractive(): void;
  isRunning(): boolean;
}

export interface ExecutionConfig {
  maxTokens: number;
  claudeCliBinary: string;
  testCommand: string;
  autoValidate: boolean;
  /** Override the default 10-minute execution timeout. */
  timeoutMs?: number;
}

export type LogEvent = {
  timestamp: string;
  type: 'start' | 'output' | 'error' | 'end';
  content: string;
};

export interface BulkExecutionItem {
  specId: string;
  status: 'queued' | 'executing' | 'completed' | 'failed';
}

export interface BulkExecutionState {
  items: BulkExecutionItem[];
  isRunning: boolean;
  currentIndex: number;
}

export interface ExecutionRecord {
  specId: string;
  executionNumber: number;
  timestamp: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  duration: number;
  testsPassed: boolean | null;
  prUrl: string | null;
  changedFiles?: string[];
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  tokensIn: number;
  tokensOut: number;
  duration: number;
  error?: string;
}

export interface ExecutionRunner {
  execute(spec: import('../specs/types').SpecDocument, context: string, config: ExecutionConfig, aiConfig?: import('../config/aiConfigTypes').AIConfig, specFilePath?: string): Promise<ExecutionResult>;
  abort(): void;
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

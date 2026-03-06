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
  execute(spec: import('../specs/types').SpecDocument, context: string, config: ExecutionConfig): Promise<ExecutionResult>;
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

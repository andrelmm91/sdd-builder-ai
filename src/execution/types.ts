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
  scopeViolation: boolean;
}

export interface ExecutionConfig {
  maxTokens: number;
  claudeCliBinary: string;
  testCommand: string;
  autoValidate: boolean;
}

export type LogEvent = {
  timestamp: string;
  type: 'start' | 'output' | 'error' | 'end';
  content: string;
};

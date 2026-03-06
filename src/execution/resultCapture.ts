import { execCommand, isCommandAvailable } from '../utils/shell';
import { writeWorkspaceFile, readWorkspaceFile, listFiles, getWorkspaceRoot } from '../utils/fileSystem';
import { EXECUTIONS_FOLDER } from '../utils/constants';
import { estimateCost } from './budgetEnforcer';
import type { ExecutionRecord } from './types';
import type { ExecutionResult } from './cliRunner';

export type CaptureResult = {
  record: ExecutionRecord;
  logPath: string;
  changedFiles: string[];
};

/**
 * Captures and stores execution results to `.sdd/executions/{specId}/exec-{NNN}.json` and `.log`.
 * @param mustNotTouch Optional list of files that should not have been modified (scope violation detection).
 */
export async function captureResults(
  specId: string,
  executionResult: ExecutionResult,
  mustNotTouch: string[] = [],
): Promise<CaptureResult> {
  const root = getWorkspaceRoot();

  // Capture git diff info
  let changedFiles: string[] = [];
  let diffContent = '';

  const gitAvailable = await isCommandAvailable('git');
  if (gitAvailable && root) {
    const nameOnlyResult = await execCommand('git diff --name-only', { cwd: root });
    if (nameOnlyResult.success) {
      changedFiles = nameOnlyResult.stdout
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } else {
      console.warn('[SDD] git diff --name-only failed:', nameOnlyResult.stderr);
    }

    const diffResult = await execCommand('git diff', { cwd: root });
    if (diffResult.success) {
      diffContent = diffResult.stdout;
    } else {
      console.warn('[SDD] git diff failed:', diffResult.stderr);
    }
  } else {
    console.warn('[SDD] git is not available — skipping diff capture');
  }

  // Detect scope violations
  const scopeViolation =
    mustNotTouch.length > 0 && changedFiles.some((f) => mustNotTouch.includes(f));

  // Determine next execution number
  const executionNumber = await nextExecutionNumber(specId);
  const paddedNum = String(executionNumber).padStart(3, '0');
  const basePath = `${EXECUTIONS_FOLDER}/${specId}/exec-${paddedNum}`;

  // Build execution record
  const status = executionResult.success ? 'completed' : 'failed';
  const cost = estimateCost(executionResult.tokensIn, executionResult.tokensOut);

  const record: ExecutionRecord = {
    specId,
    executionNumber,
    timestamp: new Date().toISOString(),
    tokensIn: executionResult.tokensIn,
    tokensOut: executionResult.tokensOut,
    cost,
    status,
    duration: executionResult.duration,
    testsPassed: null,
    prUrl: null,
    scopeViolation,
  };

  // Write record JSON
  await writeWorkspaceFile(`${basePath}.json`, JSON.stringify(record, null, 2));

  // Build and write execution log
  const logLines: string[] = [
    `=== SDD Execution Log: ${specId} #${paddedNum} ===`,
    `Timestamp : ${record.timestamp}`,
    `Status    : ${record.status}`,
    `Duration  : ${record.duration}ms`,
    `Tokens In : ${record.tokensIn}`,
    `Tokens Out: ${record.tokensOut}`,
    `Cost      : $${record.cost.toFixed(6)}`,
    `Scope OK  : ${scopeViolation ? 'VIOLATION DETECTED' : 'ok'}`,
    '',
    '--- Changed Files ---',
    changedFiles.length > 0 ? changedFiles.join('\n') : '(none)',
    '',
    '--- Output ---',
    executionResult.output,
  ];

  if (diffContent) {
    logLines.push('', '--- Git Diff ---', diffContent);
  }

  if (executionResult.error) {
    logLines.push('', '--- Error ---', executionResult.error);
  }

  const logPath = `${basePath}.log`;
  await writeWorkspaceFile(logPath, logLines.join('\n'));

  return { record, logPath, changedFiles };
}

/**
 * Reads all execution records for a spec in ascending order by execution number.
 */
export async function getExecutionHistory(specId: string): Promise<ExecutionRecord[]> {
  const pattern = `${EXECUTIONS_FOLDER}/${specId}/exec-*.json`;
  const files = await listFiles(pattern);

  const records: ExecutionRecord[] = [];
  for (const file of files.sort()) {
    const content = await readWorkspaceFile(file);
    if (content) {
      try {
        records.push(JSON.parse(content) as ExecutionRecord);
      } catch {
        // skip malformed records
      }
    }
  }

  return records.sort((a, b) => a.executionNumber - b.executionNumber);
}

/**
 * Returns the most recent execution record for a spec, or undefined if none exist.
 */
export async function getLatestExecution(specId: string): Promise<ExecutionRecord | undefined> {
  const history = await getExecutionHistory(specId);
  return history.at(-1);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function nextExecutionNumber(specId: string): Promise<number> {
  const pattern = `${EXECUTIONS_FOLDER}/${specId}/exec-*.json`;
  const files = await listFiles(pattern);
  if (files.length === 0) {
    return 1;
  }

  let max = 0;
  for (const file of files) {
    const match = /exec-(\d+)\.json$/.exec(file);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) {
        max = n;
      }
    }
  }

  return max + 1;
}

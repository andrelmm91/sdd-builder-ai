import { writeWorkspaceFile, readWorkspaceFile, listFiles } from '../utils/fileSystem';
import { EXECUTIONS_FOLDER, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { parseFrontmatter } from '../utils/frontmatter';
import type { ExecutionRecord, ExecutionResult } from './types';

export type CaptureResult = {
  record: ExecutionRecord;
  logPath: string;
  changedFiles: string[];
};

/**
 * Captures and stores execution results to `.sdd/executions/{specId}/exec-{NNN}.json` and `.log`.
 * Reads `must_not_touch` from the spec file to detect scope violations.
 */
export async function captureResults(
  specId: string,
  executionResult: ExecutionResult,
): Promise<CaptureResult> {
  const mustNotTouch = await loadMustNotTouch(specId);
  const changedFiles: string[] = [];

  // Detect scope violations
  const scopeViolation =
    mustNotTouch.length > 0 &&
    changedFiles.some((f) => {
      const filePath = f.split(' ').slice(1).join(' ');
      return mustNotTouch.includes(filePath);
    });

  // Determine next execution number
  const executionNumber = await nextExecutionNumber(specId);
  const paddedNum = String(executionNumber).padStart(3, '0');
  const basePath = `${EXECUTIONS_FOLDER}/${specId}/exec-${paddedNum}`;

  // Build execution record
  const status = executionResult.success ? 'completed' : 'failed';

  const record: ExecutionRecord = {
    specId,
    executionNumber,
    timestamp: new Date().toISOString(),
    status,
    duration: executionResult.duration,
    testsPassed: null,
    prUrl: null,
    changedFiles,
  };

  // Write record JSON
  await writeWorkspaceFile(`${basePath}.json`, JSON.stringify(record, null, 2));

  // Build and write execution log
  const logLines: string[] = [
    `=== SDD Execution Log: ${specId} #${paddedNum} ===`,
    `Timestamp : ${record.timestamp}`,
    `Status    : ${record.status}`,
    `Duration  : ${record.duration}ms`,
    `Scope OK  : ${scopeViolation ? 'VIOLATION DETECTED' : 'ok'}`,
    '',
    '--- Changed Files ---',
    changedFiles.length > 0 ? changedFiles.join('\n') : '(none)',
    '',
    '--- Output ---',
    executionResult.output,
  ];

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

/**
 * Loads the `must_not_touch` list from the spec file matching `specId`.
 * Returns an empty array if the spec cannot be found or parsed.
 */
async function loadMustNotTouch(specId: string): Promise<string[]> {
  const pattern = `${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`;
  const files = await listFiles(pattern);
  for (const file of files) {
    const content = await readWorkspaceFile(file);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      if (data.spec_id === specId) {
        return Array.isArray(data.must_not_touch) ? (data.must_not_touch as string[]) : [];
      }
    } catch {
      // skip unparseable files
    }
  }
  return [];
}

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

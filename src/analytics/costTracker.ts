import { listFiles, readWorkspaceFile } from '../utils/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { EXECUTIONS_FOLDER, SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import type { ExecutionRecord } from '../execution/types';

export interface CostSummary {
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  specCount: number;
  averageCostPerSpec: number;
  executionCount: number;
}

export interface SpecCostEntry {
  executionNumber: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  timestamp: string;
}

async function readAllExecutionRecords(): Promise<ExecutionRecord[]> {
  const files = await listFiles(`${EXECUTIONS_FOLDER}/**/exec-*.json`);
  const records: ExecutionRecord[] = [];
  for (const file of files) {
    const content = await readWorkspaceFile(file);
    if (content) {
      try {
        records.push(JSON.parse(content) as ExecutionRecord);
      } catch {
        // skip malformed records
      }
    }
  }
  return records;
}

export async function getProjectCostSummary(): Promise<CostSummary> {
  const records = await readAllExecutionRecords();

  if (records.length === 0) {
    return {
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCost: 0,
      specCount: 0,
      averageCostPerSpec: 0,
      executionCount: 0,
    };
  }

  const specIds = new Set(records.map((r) => r.specId));
  const totalTokensIn = records.reduce((sum, r) => sum + r.tokensIn, 0);
  const totalTokensOut = records.reduce((sum, r) => sum + r.tokensOut, 0);
  const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
  const specCount = specIds.size;

  return {
    totalTokensIn,
    totalTokensOut,
    totalCost,
    specCount,
    averageCostPerSpec: totalCost / specCount,
    executionCount: records.length,
  };
}

export async function getSpecCostHistory(specId: string): Promise<SpecCostEntry[]> {
  const files = await listFiles(`${EXECUTIONS_FOLDER}/${specId}/exec-*.json`);
  const entries: SpecCostEntry[] = [];

  for (const file of files.sort()) {
    const content = await readWorkspaceFile(file);
    if (content) {
      try {
        const record = JSON.parse(content) as ExecutionRecord;
        entries.push({
          executionNumber: record.executionNumber,
          tokensIn: record.tokensIn,
          tokensOut: record.tokensOut,
          cost: record.cost,
          timestamp: record.timestamp,
        });
      } catch {
        // skip malformed records
      }
    }
  }

  return entries.sort((a, b) => a.executionNumber - b.executionNumber);
}

export async function getCostByTag(tag: string): Promise<number> {
  const specFiles = await listFiles(`${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
  const matchingSpecIds: string[] = [];

  for (const file of specFiles) {
    const content = await readWorkspaceFile(file);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
      if (tags.includes(tag) && typeof data.spec_id === 'string') {
        matchingSpecIds.push(data.spec_id);
      }
    } catch {
      // skip unparseable files
    }
  }

  let totalCost = 0;
  for (const specId of matchingSpecIds) {
    const history = await getSpecCostHistory(specId);
    totalCost += history.reduce((sum, e) => sum + e.cost, 0);
  }

  return totalCost;
}

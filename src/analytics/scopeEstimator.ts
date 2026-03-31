import type { SpecData } from '../specs/types';
import { getBudgetForComplexity } from '../execution/budgetEnforcer';

export interface ScopeEstimate {
  totalSpecs: number;
  byComplexity: { low: number; medium: number; high: number };
  byPhase: Record<string, number>;
  byArea: Record<string, number>;
  estimatedTotalTokens: number;
  dependencyChainDepth: number;
}

export function estimateScope(specs: SpecData[]): ScopeEstimate {
  const byComplexity = { low: 0, medium: 0, high: 0 };
  const byPhase: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  let estimatedTotalTokens = 0;

  for (const spec of specs) {
    byComplexity[spec.complexity] += 1;
    estimatedTotalTokens += getBudgetForComplexity(spec.complexity);

    for (const tag of spec.tags) {
      if (tag.startsWith('phase-')) {
        byPhase[tag] = (byPhase[tag] ?? 0) + 1;
      } else {
        byArea[tag] = (byArea[tag] ?? 0) + 1;
      }
    }
  }

  return {
    totalSpecs: specs.length,
    byComplexity,
    byPhase,
    byArea,
    estimatedTotalTokens,
    dependencyChainDepth: computeChainDepth(specs),
  };
}

export function formatScopeEstimate(estimate: ScopeEstimate): string {
  const lines: string[] = [
    `Scope Estimate`,
    `==============`,
    `Total Specs    : ${estimate.totalSpecs}`,
    `By Complexity  : low=${estimate.byComplexity.low}  medium=${estimate.byComplexity.medium}  high=${estimate.byComplexity.high}`,
    `Token Budget   : ${estimate.estimatedTotalTokens.toLocaleString()} tokens`,
    `Chain Depth    : ${estimate.dependencyChainDepth}`,
  ];

  if (Object.keys(estimate.byPhase).length > 0) {
    lines.push(`By Phase       : ${formatRecord(estimate.byPhase)}`);
  }

  if (Object.keys(estimate.byArea).length > 0) {
    lines.push(`By Area        : ${formatRecord(estimate.byArea)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatRecord(record: Record<string, number>): string {
  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}

function computeChainDepth(specs: SpecData[]): number {
  if (specs.length === 0) return 0;

  const specMap = new Map<string, SpecData>(specs.map((s) => [s.spec_id, s]));
  const memo = new Map<string, number>();

  function depth(specId: string): number {
    if (memo.has(specId)) return memo.get(specId)!;
    const spec = specMap.get(specId);
    if (!spec || spec.depends_on.length === 0) {
      memo.set(specId, 0);
      return 0;
    }
    const d = Math.max(...spec.depends_on.map((dep) => depth(dep))) + 1;
    memo.set(specId, d);
    return d;
  }

  return Math.max(...specs.map((s) => depth(s.spec_id)));
}

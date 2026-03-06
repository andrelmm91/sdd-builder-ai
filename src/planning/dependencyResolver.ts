import type { SpecData } from '../specs/types';

export type DependencyError = {
  specId: string;
  message: string;
  type: 'cycle' | 'broken_ref' | 'self_ref';
};

export type DependencyValidation = {
  valid: boolean;
  errors: DependencyError[];
};

export function validateDependencies(specs: SpecData[]): DependencyValidation {
  const errors: DependencyError[] = [];
  const specIds = new Set(specs.map((s) => s.spec_id));

  for (const spec of specs) {
    for (const dep of spec.depends_on) {
      if (dep === spec.spec_id) {
        errors.push({ specId: spec.spec_id, message: `Spec "${spec.spec_id}" depends on itself`, type: 'self_ref' });
        continue;
      }
      if (!specIds.has(dep)) {
        errors.push({ specId: spec.spec_id, message: `Spec "${spec.spec_id}" references unknown dependency "${dep}"`, type: 'broken_ref' });
      }
    }
  }

  // Detect cycles using DFS (only among known IDs to avoid noise from broken refs)
  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  for (const id of specIds) visited.set(id, 'unvisited');

  const adjacency = new Map<string, string[]>();
  for (const spec of specs) {
    adjacency.set(spec.spec_id, spec.depends_on.filter((d) => specIds.has(d) && d !== spec.spec_id));
  }

  const cycleIds = new Set<string>();

  function dfs(id: string, path: string[]): void {
    visited.set(id, 'visiting');
    for (const dep of adjacency.get(id) ?? []) {
      if (visited.get(dep) === 'visiting') {
        // Found a cycle — report all nodes in the cycle path
        const cycleStart = path.indexOf(dep);
        const cycle = path.slice(cycleStart);
        for (const nodeId of cycle) {
          if (!cycleIds.has(nodeId)) {
            cycleIds.add(nodeId);
            errors.push({ specId: nodeId, message: `Spec "${nodeId}" is part of a dependency cycle: ${[...cycle, dep].join(' → ')}`, type: 'cycle' });
          }
        }
      } else if (visited.get(dep) === 'unvisited') {
        dfs(dep, [...path, dep]);
      }
    }
    visited.set(id, 'visited');
  }

  for (const id of specIds) {
    if (visited.get(id) === 'unvisited') {
      dfs(id, [id]);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getExecutionOrder(specs: SpecData[]): string[] {
  const specIds = new Set(specs.map((s) => s.spec_id));

  // Build in-degree map and adjacency list (dependents list)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep → [specs that depend on dep]

  for (const spec of specs) {
    if (!inDegree.has(spec.spec_id)) inDegree.set(spec.spec_id, 0);
    if (!dependents.has(spec.spec_id)) dependents.set(spec.spec_id, []);
  }

  for (const spec of specs) {
    for (const dep of spec.depends_on) {
      if (!specIds.has(dep) || dep === spec.spec_id) continue;
      inDegree.set(spec.spec_id, (inDegree.get(spec.spec_id) ?? 0) + 1);
      dependents.get(dep)!.push(spec.spec_id);
    }
  }

  // Kahn's algorithm — use sorted queue for determinism
  const queue: string[] = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort();

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const nextBatch: string[] = [];
    for (const dependent of dependents.get(current) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) nextBatch.push(dependent);
    }
    nextBatch.sort();
    queue.push(...nextBatch);
  }

  // Specs not included are part of a cycle; append them sorted for determinism
  const remaining = specs
    .map((s) => s.spec_id)
    .filter((id) => !order.includes(id))
    .sort();

  return [...order, ...remaining];
}

export function getReadyToExecute(specs: SpecData[]): string[] {
  const doneIds = new Set(specs.filter((s) => s.status === 'done').map((s) => s.spec_id));

  return specs
    .filter((spec) => spec.status === 'ready' && spec.depends_on.every((dep) => doneIds.has(dep)))
    .map((s) => s.spec_id)
    .sort();
}

export function getDependencyChainDepth(specs: SpecData[]): number {
  const specIds = new Set(specs.map((s) => s.spec_id));
  const adjacency = new Map<string, string[]>();
  for (const spec of specs) {
    adjacency.set(spec.spec_id, spec.depends_on.filter((d) => specIds.has(d) && d !== spec.spec_id));
  }

  const memo = new Map<string, number>();

  function depth(id: string, visiting: Set<string>): number {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0; // cycle — don't follow

    visiting.add(id);
    const deps = adjacency.get(id) ?? [];
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => depth(dep, new Set(visiting))));
    visiting.delete(id);

    memo.set(id, d);
    return d;
  }

  if (specs.length === 0) return 0;
  return Math.max(...specs.map((s) => depth(s.spec_id, new Set())));
}

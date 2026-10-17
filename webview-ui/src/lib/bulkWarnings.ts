export interface BulkWarningSpec {
  spec_id: string;
  status: string;
  depends_on: string[];
}

/**
 * Returns dependency warnings for each queued spec that has a problem.
 * Specs without problems are not included in the result.
 */
export function getBulkDependencyWarnings(
  queue: string[],
  specs: BulkWarningSpec[],
): Record<string, string[]> {
  const position = new Map(queue.map((id, i) => [id, i]));
  const byId = new Map(specs.map((s) => [s.spec_id, s]));
  const result: Record<string, string[]> = {};

  queue.forEach((id, index) => {
    const spec = byId.get(id);
    if (!spec) return;
    const warnings: string[] = [];

    for (const depId of spec.depends_on) {
      const depPos = position.get(depId);
      if (depPos !== undefined) {
        if (depPos > index) warnings.push(`${depId} is queued after this spec`);
        continue;
      }
      const dep = byId.get(depId);
      if (!dep) warnings.push(`${depId} not found`);
      else if (dep.status !== 'done') warnings.push(`${depId} is not done (${dep.status})`);
    }

    if (warnings.length > 0) result[id] = warnings;
  });

  return result;
}

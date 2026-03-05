/**
 * Parses a spec ID string into its prefix and numeric components.
 * Returns null if the string does not match the expected format.
 */
export function parseSpecId(specId: string): { prefix: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(specId);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
  };
}

/**
 * Returns the next sequential spec ID for the given prefix, given a list of
 * existing IDs. Gaps in numbering are intentionally skipped — the next ID is
 * always max + 1 (or 001 if none exist for the prefix).
 */
export function getNextSpecId(existingIds: string[], prefix: string): string {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseSpecId(id);
    if (parsed && parsed.prefix === prefix && parsed.number > max) {
      max = parsed.number;
    }
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

/**
 * Generates `count` sequential spec IDs starting after the highest existing ID
 * for the given prefix.
 */
export function generateBatchIds(count: number, existingIds: string[], prefix: string): string[] {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseSpecId(id);
    if (parsed && parsed.prefix === prefix && parsed.number > max) {
      max = parsed.number;
    }
  }
  return Array.from({ length: count }, (_, i) => {
    const num = max + i + 1;
    return `${prefix}-${String(num).padStart(3, '0')}`;
  });
}

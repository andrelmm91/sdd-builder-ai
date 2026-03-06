import { fileExists, writeWorkspaceFile, createWorkspaceDirectory } from '../utils/fileSystem';
import type { GeneratedSpec } from './types';

export interface WriteBatchResult {
  written: string[];
  errors: { specId: string; error: string }[];
}

// Header pattern: === .specs/{SPEC-ID}-{slug}.sdd.md ===
const SPEC_HEADER_RE = /^={3}\s*\.specs\/(([A-Z]+-\d+)-([a-z0-9][a-z0-9-]*)\.sdd\.md)\s*={3}$/;

/**
 * Generates a URL-safe slug from a spec title.
 * Lowercases the text, replaces spaces with hyphens, and strips non-alphanumeric characters.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parses the raw output from the SDD Planner agent into individual spec objects.
 * Sections are delimited by headers of the form:
 *   === .specs/{SPEC-ID}-{slug}.sdd.md ===
 */
export function parsePlannerOutput(output: string): GeneratedSpec[] {
  const lines = output.split('\n');
  const specs: GeneratedSpec[] = [];

  let currentSpecId: string | null = null;
  let currentSlug: string | null = null;
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentSpecId && currentSlug) {
      const content = currentLines.join('\n').trim();
      if (content) {
        specs.push({ specId: currentSpecId, slug: currentSlug, content });
      }
    }
  };

  for (const line of lines) {
    const match = SPEC_HEADER_RE.exec(line.trim());
    if (match) {
      flushCurrent();
      currentSpecId = match[2];
      currentSlug = match[3];
      currentLines = [];
    } else if (currentSpecId !== null) {
      currentLines.push(line);
    }
  }

  flushCurrent();
  return specs;
}

/**
 * Writes a batch of generated specs to the `.specs/` directory inside the workspace.
 * Skips (and reports as error) any spec whose target file already exists.
 */
export async function writeSpecBatch(
  specs: GeneratedSpec[],
  _workspaceRoot: string
): Promise<WriteBatchResult> {
  const result: WriteBatchResult = { written: [], errors: [] };

  await createWorkspaceDirectory('.specs');

  for (const spec of specs) {
    const relativePath = `.specs/${spec.specId}-${spec.slug}.sdd.md`;
    try {
      const exists = await fileExists(relativePath);
      if (exists) {
        result.errors.push({
          specId: spec.specId,
          error: `File already exists: ${relativePath}`,
        });
        continue;
      }
      await writeWorkspaceFile(relativePath, spec.content);
      result.written.push(relativePath);
    } catch (err) {
      result.errors.push({
        specId: spec.specId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

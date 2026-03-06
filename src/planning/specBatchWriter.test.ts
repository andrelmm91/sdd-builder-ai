import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fileSystem', () => ({
  fileExists: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
}));

import * as fileSystem from '../utils/fileSystem';
import { parsePlannerOutput, writeSpecBatch, generateSlug } from './specBatchWriter';

const mockFileExists = vi.mocked(fileSystem.fileExists);
const mockWriteWorkspaceFile = vi.mocked(fileSystem.writeWorkspaceFile);
const mockCreateWorkspaceDirectory = vi.mocked(fileSystem.createWorkspaceDirectory);

beforeEach(() => {
  vi.clearAllMocks();
  mockFileExists.mockResolvedValue(false);
  mockWriteWorkspaceFile.mockResolvedValue(undefined);
  mockCreateWorkspaceDirectory.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// generateSlug
// ---------------------------------------------------------------------------

describe('generateSlug', () => {
  it('lowercases the title', () => {
    expect(generateSlug('Add User Auth')).toBe('add-user-auth');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('my new feature')).toBe('my-new-feature');
  });

  it('removes special characters', () => {
    expect(generateSlug('Implement: OAuth2 (v2)')).toBe('implement-oauth2-v2');
  });

  it('collapses multiple hyphens into one', () => {
    expect(generateSlug('a  --  b')).toBe('a-b');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('  hello world  ')).toBe('hello-world');
  });

  it('handles titles with only special chars by returning an empty string', () => {
    expect(generateSlug('!!!###')).toBe('');
  });

  it('produces a valid file-name segment (alphanumeric + hyphens only)', () => {
    const slug = generateSlug('Implement spec batch writer for planner output');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

// ---------------------------------------------------------------------------
// parsePlannerOutput
// ---------------------------------------------------------------------------

describe('parsePlannerOutput', () => {
  it('parses a single spec from planner output', () => {
    const output = `
=== .specs/SDD-021-batch-writer.sdd.md ===
---
spec_id: SDD-021
title: Batch Writer
---

## Context
Some content here.
`;
    const specs = parsePlannerOutput(output);
    expect(specs).toHaveLength(1);
    expect(specs[0].specId).toBe('SDD-021');
    expect(specs[0].slug).toBe('batch-writer');
    expect(specs[0].content).toContain('spec_id: SDD-021');
  });

  it('parses multiple specs from planner output', () => {
    const output = `
=== .specs/SDD-001-first-spec.sdd.md ===
Content of first spec.

=== .specs/SDD-002-second-spec.sdd.md ===
Content of second spec.
`;
    const specs = parsePlannerOutput(output);
    expect(specs).toHaveLength(2);
    expect(specs[0].specId).toBe('SDD-001');
    expect(specs[0].slug).toBe('first-spec');
    expect(specs[1].specId).toBe('SDD-002');
    expect(specs[1].slug).toBe('second-spec');
  });

  it('trims content surrounding each spec', () => {
    const output = `=== .specs/SDD-010-trim-test.sdd.md ===

   body text   

`;
    const specs = parsePlannerOutput(output);
    expect(specs[0].content).toBe('body text');
  });

  it('handles variations in whitespace around the header', () => {
    const output = `  ===  .specs/SDD-005-slug-here.sdd.md  ===  \ncontent`;
    const specs = parsePlannerOutput(output);
    expect(specs).toHaveLength(1);
    expect(specs[0].specId).toBe('SDD-005');
  });

  it('ignores text before the first header', () => {
    const output = `Some preamble text from the planner.
Not a spec.

=== .specs/SDD-030-my-spec.sdd.md ===
Actual spec content.
`;
    const specs = parsePlannerOutput(output);
    expect(specs).toHaveLength(1);
    expect(specs[0].content).toBe('Actual spec content.');
  });

  it('returns an empty array when there are no headers', () => {
    expect(parsePlannerOutput('no headers here')).toHaveLength(0);
  });

  it('returns an empty array for empty input', () => {
    expect(parsePlannerOutput('')).toHaveLength(0);
  });

  it('skips sections with empty content', () => {
    const output = `=== .specs/SDD-099-empty.sdd.md ===

=== .specs/SDD-100-has-content.sdd.md ===
Some content.
`;
    const specs = parsePlannerOutput(output);
    expect(specs).toHaveLength(1);
    expect(specs[0].specId).toBe('SDD-100');
  });
});

// ---------------------------------------------------------------------------
// writeSpecBatch
// ---------------------------------------------------------------------------

describe('writeSpecBatch', () => {
  const specs = [
    { specId: 'SDD-021', slug: 'batch-writer', content: '# SDD-021 content' },
    { specId: 'SDD-022', slug: 'another-spec', content: '# SDD-022 content' },
  ];

  it('creates the .specs directory before writing', async () => {
    await writeSpecBatch(specs, '/workspace');
    expect(mockCreateWorkspaceDirectory).toHaveBeenCalledWith('.specs');
  });

  it('writes each spec to the correct path', async () => {
    await writeSpecBatch(specs, '/workspace');
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      '.specs/SDD-021-batch-writer.sdd.md',
      '# SDD-021 content'
    );
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      '.specs/SDD-022-another-spec.sdd.md',
      '# SDD-022 content'
    );
  });

  it('returns written paths on success', async () => {
    const result = await writeSpecBatch(specs, '/workspace');
    expect(result.written).toEqual([
      '.specs/SDD-021-batch-writer.sdd.md',
      '.specs/SDD-022-another-spec.sdd.md',
    ]);
    expect(result.errors).toHaveLength(0);
  });

  it('reports a conflict error when a file already exists and does not overwrite it', async () => {
    mockFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await writeSpecBatch(specs, '/workspace');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].specId).toBe('SDD-021');
    expect(result.errors[0].error).toMatch(/already exists/i);
    expect(result.written).toEqual(['.specs/SDD-022-another-spec.sdd.md']);

    // Must NOT have written the conflicting file
    expect(mockWriteWorkspaceFile).not.toHaveBeenCalledWith(
      '.specs/SDD-021-batch-writer.sdd.md',
      expect.anything()
    );
  });

  it('captures write errors without throwing', async () => {
    mockWriteWorkspaceFile.mockRejectedValueOnce(new Error('disk full'));

    const result = await writeSpecBatch(
      [{ specId: 'SDD-050', slug: 'fail-spec', content: 'content' }],
      '/workspace'
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].specId).toBe('SDD-050');
    expect(result.errors[0].error).toBe('disk full');
    expect(result.written).toHaveLength(0);
  });

  it('returns empty written and errors arrays when given no specs', async () => {
    const result = await writeSpecBatch([], '/workspace');
    expect(result.written).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

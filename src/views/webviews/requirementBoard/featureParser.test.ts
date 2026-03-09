import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import {
  sanitizeFeatureName,
  parseFeatureFile,
  loadFeatureCards,
} from './featureParser';

// ── sanitizeFeatureName ──────────────────────────────────────────────────────

describe('sanitizeFeatureName', () => {
  it('lowercases the name', () => {
    expect(sanitizeFeatureName('MyFeature')).toBe('myfeature');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFeatureName('my feature name')).toBe('my_feature_name');
  });

  it('removes special characters', () => {
    expect(sanitizeFeatureName('feature! @#$%')).toBe('feature_');
  });

  it('handles mixed case with spaces and specials', () => {
    expect(sanitizeFeatureName('New Feature (v2)')).toBe('new_feature_v2');
  });

  it('leaves already-clean names unchanged', () => {
    expect(sanitizeFeatureName('already_clean')).toBe('already_clean');
  });

  it('collapses multiple spaces into a single underscore', () => {
    expect(sanitizeFeatureName('a  b')).toBe('a_b');
  });
});

// ── parseFeatureFile ─────────────────────────────────────────────────────────

describe('parseFeatureFile', () => {
  it('parses valid frontmatter', () => {
    const content = `---\nstatus: Feature Backlog\ndate: 2026-03-09\n---\n\nSome body`;
    const { data, body } = parseFeatureFile(content);
    expect(data.status).toBe('Feature Backlog');
    expect(data.date).toBe('2026-03-09');
    expect(body).toContain('Some body');
  });

  it('defaults status to "Feature Backlog" when missing', () => {
    const content = `---\ndate: 2026-01-01\n---\n`;
    const { data } = parseFeatureFile(content);
    expect(data.status).toBe('Feature Backlog');
  });

  it('parses "SDD Created" status', () => {
    const content = `---\nstatus: SDD Created\ndate: 2026-03-09\n---\n`;
    const { data } = parseFeatureFile(content);
    expect(data.status).toBe('SDD Created');
  });

  it('handles missing frontmatter gracefully', () => {
    const content = `Just a plain markdown body`;
    const { data, body } = parseFeatureFile(content);
    expect(data.status).toBe('Feature Backlog');
    expect(body).toContain('Just a plain markdown body');
  });
});

// ── loadFeatureCards — board display rules ───────────────────────────────────

const enc = new TextEncoder();

function makeUri(path: string): vscode.Uri {
  return vscode.Uri.file(path);
}

describe('loadFeatureCards display rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory = vi.fn();
  });

  it('returns empty array when product folder does not exist', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockRejectedValue(new Error('not found'));
    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toEqual([]);
  });

  it('ignores loose files (non-directory entries)', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockResolvedValue([['Idea_1.md', vscode.FileType.File]]);
    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toEqual([]);
  });

  it('uses idealization.md status when it exists', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockResolvedValue([['my_feature', vscode.FileType.Directory]]);

    vi.mocked(vscode.workspace.fs.readFile)
      // idealization.md — succeeds
      .mockResolvedValueOnce(
        enc.encode('---\nstatus: Idealization In Review\ndate: 2026-03-09\n---\n'),
      );

    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('Idealization In Review');
    expect(cards[0].hasIdealization).toBe(true);
    expect(cards[0].name).toBe('my_feature');
  });

  it('falls back to feature file when no idealization.md and status is Feature Backlog', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockResolvedValue([['my_feature', vscode.FileType.Directory]]);

    vi.mocked(vscode.workspace.fs.readFile)
      // idealization.md — fails
      .mockRejectedValueOnce(new Error('no file'))
      // feature file — succeeds with Feature Backlog
      .mockResolvedValueOnce(enc.encode('---\nstatus: Feature Backlog\ndate: 2026-03-09\n---\n'));

    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('Feature Backlog');
    expect(cards[0].hasIdealization).toBe(false);
  });

  it('excludes feature card if no idealization and status is not Feature Backlog', async () => {
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockResolvedValue([['my_feature', vscode.FileType.Directory]]);

    vi.mocked(vscode.workspace.fs.readFile)
      .mockRejectedValueOnce(new Error('no idealization'))
      .mockResolvedValueOnce(enc.encode('---\nstatus: SDD Created\ndate: 2026-03-09\n---\n'));

    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toHaveLength(0);
  });

  it('skips folder and warns when feature file is also missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (vscode.workspace.fs as { readDirectory: ReturnType<typeof vi.fn> }).readDirectory =
      vi.fn().mockResolvedValue([['bad_feature', vscode.FileType.Directory]]);

    vi.mocked(vscode.workspace.fs.readFile)
      .mockRejectedValueOnce(new Error('no idealization'))
      .mockRejectedValueOnce(new Error('no feature file'));

    const cards = await loadFeatureCards(makeUri('/workspace/.sdd/product'));
    expect(cards).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bad_feature'));
    warnSpy.mockRestore();
  });
});

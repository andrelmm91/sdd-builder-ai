import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    activeTextEditor: undefined,
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => p }),
  },
}));

import * as vscode from 'vscode';
import { createMarkReadyCommand } from './markReady';

// Minimal valid spec content for testing
function makeSpecContent(status: string, extraBody = ''): string {
  return `---
spec_id: SDD-001
title: Test Spec
status: ${status}
priority: medium
complexity: medium
tags: [feature]
relevant_files: [src/foo.ts]
must_not_touch: []
depends_on: []
agent_skills: backend-dev
created: 2026-03-05
---

## Context

This is the context for the test spec.

## Requirements

### Functional
- [ ] Primary behaviour

### Non-Functional
- [ ] Performance requirement

## Acceptance Criteria

### Automated
- [ ] Unit tests pass

### Manual
- [ ] Feature works manually

## Constraints
- Follow project conventions
${extraBody}`;
}

describe('createMarkReadyCommand', () => {
  let refresh: ReturnType<typeof vi.fn>;
  let command: ReturnType<typeof createMarkReadyCommand>;

  beforeEach(() => {
    vi.clearAllMocks();
    refresh = vi.fn();
    command = createMarkReadyCommand(refresh);
    // Reset activeTextEditor
    (vscode.window as Record<string, unknown>)['activeTextEditor'] = undefined;
  });

  it('shows error when no file is selected or open', async () => {
    await command(undefined);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No spec file selected or open.'
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('validates before transitioning — rejects invalid spec', async () => {
    // Missing required fields in body (empty context)
    const invalidContent = `---
spec_id: SDD-001
title: Test
status: draft
priority: medium
complexity: medium
tags: [feature]
relevant_files: [src/foo.ts]
must_not_touch: []
depends_on: []
agent_skills: backend-dev
created: 2026-03-05
---

## Context

## Requirements

### Functional
- [ ] Something

### Non-Functional
- none

## Acceptance Criteria

### Automated
- [ ] Pass

### Manual
- [ ] Works

## Constraints
- Follow conventions
`;

    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(invalidContent) as unknown as Uint8Array
    );

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-001-test.sdd.md', spec: {} as never, filePath2: '' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Validation failed')
    );
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('validates before transitioning — rejects non-draft spec', async () => {
    // Spec already in "ready" status — transition draft→ready should fail
    const content = makeSpecContent('ready');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-001-test.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Invalid transition")
    );
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('marks a valid draft spec as ready and refreshes the tree', async () => {
    const content = makeSpecContent('draft');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);

    const item = { kind: 'spec' as const, filePath: '/ws/.specs/SDD-001-test.sdd.md' };
    await command(item as never);

    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledOnce();

    // Verify the written content has status: ready
    const [, writtenBytes] = vi.mocked(vscode.workspace.fs.writeFile).mock.calls[0];
    const written = Buffer.from(writtenBytes as Uint8Array).toString('utf8');
    expect(written).toContain('status: ready');

    expect(refresh).toHaveBeenCalledOnce();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Spec SDD-001 marked as Ready.'
    );
  });

  it('uses the active text editor when no tree item is provided', async () => {
    const content = makeSpecContent('draft');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content) as unknown as Uint8Array
    );
    vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);

    (vscode.window as Record<string, unknown>)['activeTextEditor'] = {
      document: { fileName: '/ws/.specs/SDD-001-test.sdd.md' },
    };

    await command(undefined);

    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

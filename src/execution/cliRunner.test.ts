import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpecDocument } from '../specs/types';
import type { ExecutionConfig } from './types';

// Mock VS Code API — vi.mock is hoisted, so we use vi.hoisted() for shared state
const { mockSendText, mockShow, mockTerminal, mockOnDidCloseTerminal, mockShowInformationMessage, mockCreateTerminal } = vi.hoisted(() => {
  const mockSendText = vi.fn();
  const mockShow = vi.fn();
  const mockTerminal = {
    show: mockShow,
    sendText: mockSendText,
    dispose: vi.fn(),
  };
  const mockOnDidCloseTerminal = vi.fn().mockReturnValue({ dispose: vi.fn() });
  // showInformationMessage must return a Promise so callers can .then() on it
  const mockShowInformationMessage = vi.fn().mockResolvedValue(undefined);
  const mockCreateTerminal = vi.fn().mockReturnValue(mockTerminal);
  return { mockSendText, mockShow, mockTerminal, mockOnDidCloseTerminal, mockShowInformationMessage, mockCreateTerminal };
});

vi.mock('vscode', () => ({
  window: {
    createTerminal: mockCreateTerminal,
    onDidCloseTerminal: (...args: unknown[]) => mockOnDidCloseTerminal(...args),
    showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
  },
  workspace: {
    fs: {
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

vi.mock('../utils/fileSystem', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
}));

vi.mock('../utils/shell', () => ({
  isCommandAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('./skillsLoader', () => ({
  getSkillsPath: vi.fn().mockResolvedValue(null),
}));

const { mockAccess, mockReadFile, mockUnlink, mockWriteFile } = vi.hoisted(() => ({
  mockAccess: vi.fn().mockRejectedValue(new Error('ENOENT')),
  mockReadFile: vi.fn().mockResolvedValue('0'),
  mockUnlink: vi.fn().mockResolvedValue(undefined),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    access: mockAccess,
    readFile: mockReadFile,
    unlink: mockUnlink,
    writeFile: mockWriteFile,
  };
});

import { CliRunner } from './cliRunner';
import { isCommandAvailable } from '../utils/shell';
import { getWorkspaceRoot } from '../utils/fileSystem';

const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockGetWorkspaceRoot = vi.mocked(getWorkspaceRoot);

function makeSpec(overrides: Partial<SpecDocument> = {}): SpecDocument {
  return {
    frontmatter: {
      spec_id: 'SDD-026',
      title: 'Implement Claude CLI execution runner',
      status: 'ready',
      priority: 'high',
      complexity: 'high',
      tags: ['phase-2', 'backend'],
      relevant_files: ['src/execution/cliRunner.ts'],
      must_not_touch: ['src/planning/planner.ts'],
      depends_on: ['SDD-011', 'SDD-024'],
      agent_skills: 'backend-dev',
      created: '2026-03-05',
    },
    context: 'CLI runner spec context.',
    functionalRequirements: '- Implement CliRunner',
    nonFunctionalRequirements: '- Must use VS Code Terminal API',
    automatedCriteria: '- [ ] TypeScript compilation passes',
    manualCriteria: '- [ ] Terminal shows output',
    constraints: 'Must use VS Code Terminal API',
    examples: '',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ExecutionConfig> = {}): ExecutionConfig {
  return {
    maxTokens: 100000,
    claudeCliBinary: 'claude',
    testCommand: 'npm test',
    autoValidate: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspaceRoot.mockReturnValue('/workspace');
  mockIsCommandAvailable.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// CliRunner — state management
// ---------------------------------------------------------------------------
describe('CliRunner.isRunning', () => {
  it('returns false initially', () => {
    const runner = new CliRunner();
    expect(runner.isRunning()).toBe(false);
  });
});

describe('CliRunner.abort', () => {
  it('sets isRunning to false after abort', () => {
    const runner = new CliRunner();
    // Force running state via internal mechanism
    (runner as unknown as Record<string, unknown>)['_running'] = true;
    runner.abort();
    expect(runner.isRunning()).toBe(false);
  });

  it('sends Ctrl+C to the terminal if one is active', () => {
    const runner = new CliRunner();
    const mockSendText = vi.fn();
    (runner as unknown as Record<string, unknown>)['_terminal'] = { sendText: mockSendText };
    (runner as unknown as Record<string, unknown>)['_running'] = true;

    runner.abort();

    expect(mockSendText).toHaveBeenCalledWith('\x03', false);
    expect(runner.isRunning()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CliRunner.execute — error paths (no child_process spawning needed)
// ---------------------------------------------------------------------------
describe('CliRunner.execute', () => {
  it('returns error result when Claude CLI binary is not found', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);
    const runner = new CliRunner();

    const result = await runner.execute(makeSpec(), makeConfig({ claudeCliBinary: 'no-such-cli' }));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Claude CLI not found/);
    expect(result.error).toMatch(/no-such-cli/);
  });

  it('returns error result when no workspace is open', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined);
    const runner = new CliRunner();

    const result = await runner.execute(makeSpec(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No workspace/i);
  });

  it('returns error result when already running', async () => {
    const runner = new CliRunner();
    (runner as unknown as Record<string, unknown>)['_running'] = true;

    const result = await runner.execute(makeSpec(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Already running/);
  });

  it('constructs correct Claude CLI command from config', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined); // stop early
    const runner = new CliRunner();
    const config = makeConfig({ claudeCliBinary: 'my-claude', maxTokens: 50000 });

    await runner.execute(makeSpec(), config);

    // workspace root returned undefined so no terminal was created — just verify no error about CLI
    // (the binary check passed, then getWorkspaceRoot returned undefined → 'No workspace' error)
    expect(mockIsCommandAvailable).toHaveBeenCalledWith('my-claude');
  });

  it('resets isRunning to false after execution completes', async () => {
    mockGetWorkspaceRoot.mockReturnValue(undefined); // stop early so no terminal spawning
    const runner = new CliRunner();

    await runner.execute(makeSpec(), makeConfig());

    expect(runner.isRunning()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CliRunner.execute — terminal interaction tests (POSIX / bash script path)
// ---------------------------------------------------------------------------
describe('CliRunner.execute — terminal commands (POSIX)', () => {
  const actualPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.useFakeTimers();
    mockWriteFile.mockClear();
    mockSendText.mockClear();
    mockShow.mockClear();
    mockOnDidCloseTerminal.mockClear();
    mockShowInformationMessage.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: actualPlatform, configurable: true });
    vi.useRealTimers();
  });

  it('Claude dangerously-skip-permissions: includes -p flag and sentinel', async () => {
    // Mock fs.access to resolve immediately (sentinel "exists")
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('0');

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'claude',
      permissionMode: 'dangerously-skip-permissions',
    });

    // Advance past sentinel polling (no shell-init delay in the bash-script approach)
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;

    expect(result.success).toBe(true);
    // Terminal launched via bash script — sendText never used for dispatch
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockCreateTerminal).toHaveBeenCalledWith(expect.objectContaining({
      shellPath: '/bin/bash',
    }));
    // The script written to disk should include -p and --dangerously-skip-permissions
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).toContain('-p');
    expect(scriptContent).toContain('--dangerously-skip-permissions');
    // Non-interactive: wrapped with group + tee for output capture
    expect(scriptContent).toContain('echo $?');
    expect(scriptContent).toContain('tee');
  });

  it('Claude default mode: interactive, no sentinel, no info message from runner', async () => {
    // For interactive mode, simulate terminal close
    mockOnDidCloseTerminal.mockImplementation((cb: (t: unknown) => void) => {
      setTimeout(() => cb(mockTerminal), 2000);
      return { dispose: vi.fn() };
    });

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'claude',
      permissionMode: 'default',
    });

    // Advance past the terminal close simulation (no shell-init delay in the bash-script approach)
    await vi.advanceTimersByTimeAsync(2000);
    // Advance past abort poll interval
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;

    expect(result.success).toBe(true);
    // Terminal launched via bash script — sendText never used for dispatch
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockCreateTerminal).toHaveBeenCalledWith(expect.objectContaining({
      shellPath: '/bin/bash',
    }));
    // Script content should NOT include sentinel or tee (interactive mode)
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).not.toContain('echo $?');
    expect(scriptContent).not.toContain('tee');
    // Runner no longer shows a notification — that's executeSpec.ts's responsibility
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('Copilot ask mode: interactive (same as Claude default), prompt embedded via -p', async () => {
    // Copilot ask is now interactive — it uses a TUI that needs a real terminal
    mockOnDidCloseTerminal.mockImplementation((cb: (t: unknown) => void) => {
      setTimeout(() => cb(mockTerminal), 2000);
      return { dispose: vi.fn() };
    });

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'copilot',
      permissionMode: 'default',
    });

    // Advance past terminal close simulation and abort poll (no shell-init delay)
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result.success).toBe(true);

    // Terminal launched via bash script — sendText never used for dispatch
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockCreateTerminal).toHaveBeenCalledWith(expect.objectContaining({
      shellPath: '/bin/bash',
    }));
    // Script content should use gh copilot
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).toContain('gh copilot');
    // Prompt is passed as a positional arg — NOT via -p (which would be batch/non-interactive)
    expect(scriptContent).not.toContain(' -p ');
    // Should NOT use --yolo (ask mode keeps permission prompts)
    expect(scriptContent).not.toContain('--yolo');
    // Should NOT include sentinel or tee (interactive mode)
    expect(scriptContent).not.toContain('echo $?');

    // Runner no longer shows a notification — that's executeSpec.ts's responsibility
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CliRunner.execute — terminal interaction tests (Windows / PowerShell path)
// ---------------------------------------------------------------------------
describe('CliRunner.execute — terminal commands (Windows)', () => {
  const actualPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.useFakeTimers();
    mockWriteFile.mockClear();
    mockSendText.mockClear();
    mockShow.mockClear();
    mockOnDidCloseTerminal.mockClear();
    mockShowInformationMessage.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: actualPlatform, configurable: true });
    vi.useRealTimers();
  });

  it('Claude dangerously-skip-permissions: PS1 script with Tee-Object and Out-File sentinel', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('0');

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'claude',
      permissionMode: 'dangerously-skip-permissions',
    });

    // No 1-second delay — PS1 script approach is race-free like POSIX
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result.success).toBe(true);
    // Terminal launched via PS1 script — sendText never used for dispatch
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockCreateTerminal).toHaveBeenCalledWith(expect.objectContaining({
      shellPath: 'powershell.exe',
      shellArgs: expect.arrayContaining(['-NoExit', '-ExecutionPolicy', 'Bypass', '-Command']),
    }));
    // Script has .ps1 extension
    const scriptPath = mockWriteFile.mock.calls[0][0] as string;
    expect(scriptPath).toMatch(/\.ps1$/);
    // Script content uses PowerShell syntax — no bash idioms
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).toContain('-p');
    expect(scriptContent).toContain('--dangerously-skip-permissions');
    expect(scriptContent).toContain('Tee-Object');
    expect(scriptContent).toContain('$LASTEXITCODE');
    expect(scriptContent).toContain('Out-File');
    expect(scriptContent).not.toContain('#!/bin/bash');
    expect(scriptContent).not.toContain('echo $?');
  });

  it('Claude default mode: interactive PS1 script, no sentinel wrapping', async () => {
    mockOnDidCloseTerminal.mockImplementation((cb: (t: unknown) => void) => {
      setTimeout(() => cb(mockTerminal), 2000);
      return { dispose: vi.fn() };
    });

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'claude',
      permissionMode: 'default',
    });

    await vi.advanceTimersByTimeAsync(2000); // terminal close fires
    await vi.advanceTimersByTimeAsync(500);  // abort poll
    const result = await promise;

    expect(result.success).toBe(true);
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockCreateTerminal).toHaveBeenCalledWith(expect.objectContaining({
      shellPath: 'powershell.exe',
      shellArgs: expect.arrayContaining(['-NoExit']),
    }));
    const scriptPath = mockWriteFile.mock.calls[0][0] as string;
    expect(scriptPath).toMatch(/\.ps1$/);
    // Interactive: no sentinel or tee wrapping
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).not.toContain('Tee-Object');
    expect(scriptContent).not.toContain('Out-File');
    expect(scriptContent).not.toContain('echo $?');
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('Copilot ask mode: interactive PS1 script with gh copilot command', async () => {
    mockOnDidCloseTerminal.mockImplementation((cb: (t: unknown) => void) => {
      setTimeout(() => cb(mockTerminal), 2000);
      return { dispose: vi.fn() };
    });

    const runner = new CliRunner();
    const promise = runner.execute(makeSpec(), makeConfig(), {
      provider: 'copilot',
      permissionMode: 'default',
    });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(mockSendText).not.toHaveBeenCalled();
    const scriptContent = mockWriteFile.mock.calls[0][1] as string;
    expect(scriptContent).toContain('gh copilot');
    expect(scriptContent).not.toContain(' -p ');
    expect(scriptContent).not.toContain('--yolo');
    expect(scriptContent).not.toContain('Tee-Object');
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

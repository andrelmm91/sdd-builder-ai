import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode before importing initProject
vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/fake/workspace' } }],
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createDirectory: vi.fn(),
      stat: vi.fn(),
    },
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    findFiles: vi.fn(async () => []),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

vi.mock('../utils/fileSystem', () => ({
  fileExists: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  readWorkspaceFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/projectConfig', () => ({
  getDefaultProjectConfig: vi.fn(() => ({
    prefix: 'SDD',
    testCommand: 'npm test',
    conventionsPath: '.sdd/conventions.md',
    skillsPath: '.sdd/skills',
  })),
  writeProjectConfig: vi.fn(),
}));

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
}));

vi.mock('../config/extensionConfig', () => ({
  getClaudeCliBinary: vi.fn(() => 'claude'),
}));

import * as vscode from 'vscode';
import * as fileSystem from '../utils/fileSystem';
import * as projectConfig from '../config/projectConfig';
import * as shell from '../utils/shell';
import { initProject } from './initProject';

describe('initProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all health checks succeed
    vi.mocked(shell.execCommand).mockResolvedValue({
      stdout: 'version output',
      stderr: '',
      exitCode: 0,
      success: true,
    });
  });

  it('creates expected directory structure on fresh init', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(false);
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    await initProject();

    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledWith('.specs');
    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledWith('.sdd');
    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledWith('.sdd/executions');
    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledWith('.sdd/reviews');
    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledWith('.sdd/skills');
  });

  it('writes config, conventions, and skill placeholder files', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(false);
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    await initProject();

    expect(projectConfig.writeProjectConfig).toHaveBeenCalledWith(
      projectConfig.getDefaultProjectConfig()
    );
    expect(fileSystem.writeWorkspaceFile).toHaveBeenCalledWith(
      '.sdd/conventions.md',
      expect.stringContaining('## Code Style')
    );
    expect(fileSystem.writeWorkspaceFile).toHaveBeenCalledWith(
      '.sdd/skills/sdd-planner/SKILL.md',
      expect.stringContaining('SDD Planner Skill')
    );
  });

  it('prompts for confirmation when already initialized and aborts on No', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(true);
    vi.mocked(vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('No');

    await initProject();

    expect(fileSystem.createWorkspaceDirectory).not.toHaveBeenCalled();
    expect(projectConfig.writeProjectConfig).not.toHaveBeenCalled();
  });

  it('reinitializes when already initialized and user confirms Yes', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(true);
    vi.mocked(vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Yes');
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    await initProject();

    expect(fileSystem.createWorkspaceDirectory).toHaveBeenCalledTimes(6);
    expect(projectConfig.writeProjectConfig).toHaveBeenCalled();
  });

  it('shows health check results in information message', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(false);
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    // Git and Claude succeed, gh fails
    vi.mocked(shell.execCommand)
      .mockResolvedValueOnce({ stdout: 'git version 2.x', stderr: '', exitCode: 0, success: true })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1, success: false })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1, success: false });

    await initProject();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Git ✓.*Claude CLI ✗.*gh CLI ✗/)
    );
  });

  it('health check correctly detects all tools available', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(false);
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    await initProject();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'SDD project initialized. Health: Git ✓, Claude CLI ✓, gh CLI ✓'
    );
  });
});

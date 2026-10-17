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

vi.mock('./doctor', () => ({
  runDoctor: vi.fn().mockResolvedValue({ checks: [], ranAt: '', ready: true }),
}));

import * as vscode from 'vscode';
import * as fileSystem from '../utils/fileSystem';
import * as projectConfig from '../config/projectConfig';
import { runDoctor } from './doctor';
import { initProject } from './initProject';

describe('initProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('runs the doctor after scaffolding and shows a simple notification', async () => {
    vi.mocked(fileSystem.fileExists).mockResolvedValue(false);
    vi.mocked(fileSystem.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(fileSystem.writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(projectConfig.writeProjectConfig).mockResolvedValue(undefined);

    await initProject();

    expect(runDoctor).toHaveBeenCalledTimes(1);
    const doctorOrder = vi.mocked(runDoctor).mock.invocationCallOrder[0];
    const lastWriteOrder = Math.max(...vi.mocked(fileSystem.writeWorkspaceFile).mock.invocationCallOrder);
    expect(doctorOrder).toBeGreaterThan(lastWriteOrder);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('SDD project initialized.');
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(expect.stringContaining('Health:'));
  });
});

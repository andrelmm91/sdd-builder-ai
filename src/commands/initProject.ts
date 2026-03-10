import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { fileExists, writeWorkspaceFile, createWorkspaceDirectory } from '../utils/fileSystem';
import { getDefaultProjectConfig, writeProjectConfig } from '../config/projectConfig';
import { writeAIConfig, writeRequirementsAIConfig } from '../config/aiConfig';
import { DEFAULT_AI_CONFIG, DEFAULT_REQUIREMENTS_AI_CONFIG } from '../config/aiConfigTypes';
import { execCommand } from '../utils/shell';
import { getClaudeCliBinary } from '../config/extensionConfig';
import {
  SPECS_FOLDER,
  SDD_FOLDER,
  CONFIG_FILE,
  CONVENTIONS_FILE,
  EXECUTIONS_FOLDER,
  REVIEWS_FOLDER,
  SKILLS_FOLDER,
} from '../utils/constants';

const CONVENTIONS_TEMPLATE = `# Project Conventions

## Code Style
<!-- Define your code style rules here. Example: prefer const, use 2-space indent, etc. -->

## File Structure
<!-- Describe the expected directory layout and module boundaries. -->

## Testing
<!-- Define testing standards: test frameworks, coverage targets, naming conventions. -->

## Error Handling
<!-- Describe how errors should be handled and surfaced throughout the codebase. -->
`;

function loadDefaultSkillContent(): string {
  const skillPath = path.join(__dirname, '..', 'resources', 'skills', 'sdd-planner', 'SKILL.md');
  try {
    return fs.readFileSync(skillPath, 'utf-8');
  } catch {
    return '# SDD Planner Skill\n\n<!-- Customize this file to adjust planner behavior for your project. -->\n';
  }
}

export async function initProject(): Promise<void> {
  const alreadyInitialized = await fileExists(CONFIG_FILE);
  if (alreadyInitialized) {
    const answer = await vscode.window.showWarningMessage(
      'SDD project already initialized. Reinitialize?',
      'Yes',
      'No'
    );
    if (answer !== 'Yes') {
      return;
    }
  }

  // Create directory structure
  await createWorkspaceDirectory(SPECS_FOLDER);
  await createWorkspaceDirectory(SDD_FOLDER);
  await createWorkspaceDirectory(EXECUTIONS_FOLDER);
  await createWorkspaceDirectory(REVIEWS_FOLDER);
  await createWorkspaceDirectory(SKILLS_FOLDER);

  // Write config and scaffold files (project config first, then AI defaults)
  await writeProjectConfig(getDefaultProjectConfig());
  await writeAIConfig({ ...DEFAULT_AI_CONFIG });
  await writeRequirementsAIConfig({ ...DEFAULT_REQUIREMENTS_AI_CONFIG });
  await writeWorkspaceFile(CONVENTIONS_FILE, CONVENTIONS_TEMPLATE);
  await writeWorkspaceFile(`${SKILLS_FOLDER}/sdd-planner/SKILL.md`, loadDefaultSkillContent());

  // Run health checks in parallel
  const claudeBinary = getClaudeCliBinary();
  const [gitOk, claudeOk, ghOk] = await Promise.all([
    execCommand('git --version').then((r) => r.success),
    execCommand(`${claudeBinary} --version`).then((r) => r.success),
    execCommand('gh --version').then((r) => r.success),
  ]);

  const gitStatus = gitOk ? '✓' : '✗';
  const claudeStatus = claudeOk ? '✓' : '✗';
  const ghStatus = ghOk ? '✓' : '✗ (optional)';

  vscode.window.showInformationMessage(
    `SDD project initialized. Health: Git ${gitStatus}, Claude CLI ${claudeStatus}, gh CLI ${ghStatus}`
  );
}

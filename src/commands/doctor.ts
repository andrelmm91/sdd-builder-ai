import * as vscode from 'vscode';
import { getWorkspaceRoot, readWorkspaceFile } from '../utils/fileSystem';
import { execCommand, isCommandAvailable } from '../utils/shell';
import { CONFIG_FILE, CONVENTIONS_FILE } from '../utils/constants';
import { readAIConfig } from '../config/aiConfig';
import { getProviderBinary } from '../config/extensionConfig';
import { resolveProviderDefinition, resolvePermissionMode } from '../execution/providerCommand';

const CHECK_TIMEOUT_MS = 5000;

export type DoctorCheck = {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
};

export type DoctorReport = {
  checks: DoctorCheck[];
  ranAt: string;
  ready: boolean;
};

let lastReport: DoctorReport | undefined;
let inFlight: Promise<DoctorReport> | undefined;
const reportEmitter = new vscode.EventEmitter<DoctorReport>();

export const onDoctorReport: vscode.Event<DoctorReport> = reportEmitter.event;

export function getLastDoctorReport(): DoctorReport | undefined {
  return lastReport;
}

export function runDoctor(): Promise<DoctorReport> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = collectReport()
    .then((report) => {
      lastReport = report;
      reportEmitter.fire(report);
      return report;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

async function collectReport(): Promise<DoctorReport> {
  const [config, provider, git, conventions, permission] = await Promise.all([
    checkConfig(),
    checkProviderBinary(),
    checkGit(),
    checkConventions(),
    checkPermissionMode(),
  ]);
  const checks = [config, provider, ...git, conventions, permission];
  return {
    checks,
    ranAt: new Date().toISOString(),
    ready: !checks.some((c) => c.status === 'fail'),
  };
}

async function checkConfig(): Promise<DoctorCheck> {
  const base = { id: 'config', label: 'SDD project config' };
  const content = await readWorkspaceFile(CONFIG_FILE);
  if (content === undefined) {
    return {
      ...base,
      status: 'fail',
      detail: `${CONFIG_FILE} was not found.`,
      fix: 'Run "SDD: Initialize Project" to create it.',
    };
  }
  try {
    JSON.parse(content);
    return { ...base, status: 'ok', detail: `${CONFIG_FILE} is valid.` };
  } catch {
    return {
      ...base,
      status: 'fail',
      detail: `${CONFIG_FILE} is not valid JSON.`,
      fix: `Open ${CONFIG_FILE} and fix the syntax error, or delete it and run "SDD: Initialize Project".`,
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkProviderBinary(): Promise<DoctorCheck> {
  const aiConfig = await readAIConfig();
  const def = resolveProviderDefinition(aiConfig);
  const binary = getProviderBinary(aiConfig);
  const base = { id: 'provider', label: `${def.label} CLI` };
  const available = await withTimeout(isCommandAvailable(binary), false);
  if (available) {
    return { ...base, status: 'ok', detail: `"${binary}" is installed.` };
  }
  return {
    ...base,
    status: 'fail',
    detail: `"${binary}" was not found, so specs cannot be executed.`,
    fix: `Install ${def.label} and log in, or choose another provider in AI Configuration.`,
  };
}

async function checkGit(): Promise<DoctorCheck[]> {
  const repo: Omit<DoctorCheck, 'status' | 'detail' | 'fix'> = { id: 'git', label: 'Git repository' };
  const tree: Omit<DoctorCheck, 'status' | 'detail' | 'fix'> = { id: 'git-clean', label: 'Working tree' };
  const cwd = getWorkspaceRoot();
  const opts = { cwd, timeout: CHECK_TIMEOUT_MS };

  const version = await execCommand('git --version', opts);
  if (!version.success) {
    return [
      {
        ...repo,
        status: 'warn',
        detail: 'Git is not installed. Change tracking and discarding AI changes are disabled.',
        fix: 'Install Git from https://git-scm.com.',
      },
      { ...tree, status: 'ok', detail: 'Skipped (Git is not available).' },
    ];
  }
  const inside = await execCommand('git rev-parse --is-inside-work-tree', opts);
  if (!inside.success || inside.stdout.trim() !== 'true') {
    return [
      {
        ...repo,
        status: 'warn',
        detail: 'This workspace is not a Git repository. Change tracking and discarding AI changes are disabled.',
        fix: 'Run "git init" in the workspace folder and make a first commit.',
      },
      { ...tree, status: 'ok', detail: 'Skipped (not a Git repository).' },
    ];
  }

  const status = await execCommand('git status --porcelain', opts);
  const modified = status.success ? status.stdout.split('\n').filter((l) => l.trim()).length : 0;
  const treeCheck: DoctorCheck = modified > 0
    ? {
        ...tree,
        status: 'warn',
        detail: `${modified} modified file(s). Your own edits can get mixed with the AI's changes.`,
        fix: 'Commit or stash your changes before executing a spec.',
      }
    : { ...tree, status: 'ok', detail: 'No uncommitted changes.' };
  return [{ ...repo, status: 'ok', detail: 'Workspace is a Git repository.' }, treeCheck];
}

async function checkConventions(): Promise<DoctorCheck> {
  const base = { id: 'conventions', label: 'Project conventions' };
  const content = await readWorkspaceFile(CONVENTIONS_FILE);
  const meaningful = (content ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (meaningful.length > 0) {
    return { ...base, status: 'ok', detail: `${CONVENTIONS_FILE} has content.` };
  }
  return {
    ...base,
    status: 'warn',
    detail: `${CONVENTIONS_FILE} is empty or still the template, so the AI has no project rules to follow.`,
    fix: `Describe your code style, structure and testing rules in ${CONVENTIONS_FILE}.`,
  };
}

async function checkPermissionMode(): Promise<DoctorCheck> {
  const base = { id: 'permission', label: 'Permission mode' };
  const aiConfig = await readAIConfig();
  const def = resolveProviderDefinition(aiConfig);
  const mode = resolvePermissionMode(def, aiConfig?.permissionMode);
  const detail = mode.mode === 'batch'
    ? `"${mode.label}" runs unattended, so bulk execution is available.`
    : `"${mode.label}" is interactive. Bulk execution requires a batch (full permission) mode.`;
  return { ...base, status: 'ok', detail };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    event = (l: (e: T) => void) => {
      this.listeners.push(l);
      return { dispose: () => undefined };
    };
    fire(e: T) {
      this.listeners.forEach((l) => l(e));
    }
  }
  return { EventEmitter };
});

vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn(() => '/ws'),
  readWorkspaceFile: vi.fn(),
}));
vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
  isCommandAvailable: vi.fn(),
}));
vi.mock('../config/aiConfig', () => ({
  readAIConfig: vi.fn(),
}));
vi.mock('../config/extensionConfig', () => ({
  getProviderBinary: vi.fn(() => 'claude'),
}));

import { readWorkspaceFile } from '../utils/fileSystem';
import { execCommand, isCommandAvailable } from '../utils/shell';
import { readAIConfig } from '../config/aiConfig';
import { runDoctor, getLastDoctorReport, onDoctorReport, type DoctorReport } from './doctor';

const GOOD_CONVENTIONS = '# Conventions\n## Code Style\nUse const.\n';
const TEMPLATE = '# Project Conventions\n\n## Code Style\n<!-- Define your\n multi-line comment -->\n';

function ok(stdout = '') {
  return { stdout, stderr: '', exitCode: 0, success: true };
}
function bad() {
  return { stdout: '', stderr: 'err', exitCode: 1, success: false };
}

function setup(opts: {
  config?: string | undefined;
  conventions?: string | undefined;
  binary?: boolean;
  git?: 'ok' | 'dirty' | 'norepo' | 'nogit';
  permissionMode?: string;
} = {}) {
  const { binary = true, git = 'ok', permissionMode = 'default' } = opts;
  const config = 'config' in opts ? opts.config : '{}';
  const conventions = 'conventions' in opts ? opts.conventions : GOOD_CONVENTIONS;
  vi.mocked(readWorkspaceFile).mockImplementation(async (p: string) =>
    p.endsWith('config.json') ? config : conventions,
  );
  vi.mocked(isCommandAvailable).mockResolvedValue(binary);
  vi.mocked(readAIConfig).mockResolvedValue({ provider: 'claude', permissionMode } as never);
  vi.mocked(execCommand).mockImplementation(async (cmd: string) => {
    if (cmd === 'git --version') return git === 'nogit' ? bad() : ok('git version 2');
    if (cmd.startsWith('git rev-parse')) return git === 'norepo' ? bad() : ok('true\n');
    if (cmd.startsWith('git status')) return ok(git === 'dirty' ? ' M a.ts\n?? b.ts\n' : '');
    return bad();
  });
}

const find = (r: DoctorReport, id: string) => r.checks.find((c) => c.id === id)!;

describe('runDoctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is ready with every check ok on a healthy workspace', async () => {
    setup();
    const report = await runDoctor();
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
    expect(report.ready).toBe(true);
    expect(getLastDoctorReport()).toBe(report);
  });

  it('config: fails when missing or invalid JSON', async () => {
    setup({ config: undefined });
    expect(find(await runDoctor(), 'config').status).toBe('fail');
    setup({ config: '{nope' });
    const report = await runDoctor();
    expect(find(report, 'config').status).toBe('fail');
    expect(report.ready).toBe(false);
  });

  it('provider: fails when the binary is missing', async () => {
    setup({ binary: false });
    const report = await runDoctor();
    const check = find(report, 'provider');
    expect(check.status).toBe('fail');
    expect(check.fix).toBeTruthy();
    expect(report.ready).toBe(false);
  });

  it('git: warns when git is missing or workspace is not a repo', async () => {
    setup({ git: 'nogit' });
    expect(find(await runDoctor(), 'git').status).toBe('warn');
    setup({ git: 'norepo' });
    const report = await runDoctor();
    expect(find(report, 'git').status).toBe('warn');
    expect(find(report, 'git').detail).toMatch(/disabled/);
  });

  it('working tree: warns with the modified file count', async () => {
    setup({ git: 'dirty' });
    const check = find(await runDoctor(), 'git-clean');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('2 modified');
  });

  it('conventions: warns when missing or still the template', async () => {
    setup({ conventions: TEMPLATE });
    expect(find(await runDoctor(), 'conventions').status).toBe('warn');
    setup({ conventions: undefined });
    expect(find(await runDoctor(), 'conventions').status).toBe('warn');
  });

  it('permission mode: always ok, noting batch vs interactive', async () => {
    setup({ permissionMode: 'default' });
    const interactive = find(await runDoctor(), 'permission');
    expect(interactive.status).toBe('ok');
    expect(interactive.detail).toMatch(/interactive/);
    setup({ permissionMode: 'full' });
    const full = find(await runDoctor(), 'permission');
    expect(full.status).toBe('ok');
  });

  it('is ready with only warnings, not ready with any failure', async () => {
    setup({ git: 'norepo', conventions: TEMPLATE });
    const warned = await runDoctor();
    expect(warned.checks.some((c) => c.status === 'warn')).toBe(true);
    expect(warned.ready).toBe(true);

    setup({ git: 'norepo', binary: false });
    expect((await runDoctor()).ready).toBe(false);
  });

  it('shares one run between concurrent calls and fires onDoctorReport', async () => {
    setup();
    const received: DoctorReport[] = [];
    onDoctorReport((r) => received.push(r));
    const [a, b] = await Promise.all([runDoctor(), runDoctor()]);
    expect(a).toBe(b);
    expect(received).toEqual([a]);
    expect(vi.mocked(execCommand).mock.calls.filter(([c]) => c === 'git --version')).toHaveLength(1);
  });
});

describe('package.json', () => {
  it('declares the sdd.doctor command', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const cmd = pkg.contributes.commands.find((c: { command: string }) => c.command === 'sdd.doctor');
    expect(cmd?.title).toBe('SDD: Run Doctor');
  });
});

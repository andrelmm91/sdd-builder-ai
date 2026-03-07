import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/shell', () => ({
  execCommand: vi.fn(),
}));
vi.mock('../utils/fileSystem', () => ({
  getWorkspaceRoot: vi.fn(() => '/workspace'),
}));

import { execCommand } from '../utils/shell';
import {
  createBranch,
  stageFiles,
  commit,
  push,
  getCurrentBranch,
  getChangedFiles,
  checkoutFiles,
} from './gitOps';

const mockExec = execCommand as ReturnType<typeof vi.fn>;

function ok(stdout = '') {
  return { success: true, stdout, stderr: '' };
}
function fail(stderr = '') {
  return { success: false, stdout: '', stderr };
}

beforeEach(() => vi.clearAllMocks());

describe('createBranch', () => {
  it('formats branch name as sdd/{specId}-{slug}', async () => {
    mockExec.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    const result = await createBranch('SDD-035', 'git-ops');
    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('git checkout -b sdd/SDD-035-git-ops', expect.any(Object));
  });

  it('appends -2 suffix when branch already exists', async () => {
    mockExec
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail("fatal: A branch named 'sdd/SDD-035-git-ops' already exists."))
      .mockResolvedValueOnce(ok());
    const result = await createBranch('SDD-035', 'git-ops');
    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('git checkout -b sdd/SDD-035-git-ops-2', expect.any(Object));
  });

  it('returns error when branch creation fails for other reason', async () => {
    mockExec
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail('fatal: not a git repository'));
    const result = await createBranch('SDD-035', 'git-ops');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a git repository/);
  });
});

describe('commit', () => {
  it('formats message as "feat: {title} ({specId})"', async () => {
    mockExec.mockResolvedValueOnce(ok('[main abc1234] feat: Git ops (SDD-035)'));
    await commit('SDD-035', 'Git ops');
    expect(mockExec).toHaveBeenCalledWith(
      'git commit -m "feat: Git ops (SDD-035)"',
      expect.any(Object),
    );
  });
});

describe('push', () => {
  it('succeeds on successful push', async () => {
    mockExec.mockResolvedValueOnce(ok('Branch pushed'));
    const result = await push('sdd/SDD-035-git-ops');
    expect(result.success).toBe(true);
  });

  it('returns no-remote error message', async () => {
    mockExec.mockResolvedValueOnce(
      fail("fatal: 'origin' does not appear to be a git repository"),
    );
    const result = await push('sdd/SDD-035-git-ops');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no remote/i);
  });

  it('returns auth error message', async () => {
    mockExec.mockResolvedValueOnce(fail('remote: Authentication failed'));
    const result = await push('sdd/SDD-035-git-ops');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authentication error/i);
  });
});

describe('getCurrentBranch', () => {
  it('returns the current branch name', async () => {
    mockExec.mockResolvedValueOnce(ok('main\n'));
    const branch = await getCurrentBranch();
    expect(branch).toBe('main');
  });
});

describe('getChangedFiles', () => {
  it('parses git status --porcelain output', async () => {
    mockExec.mockResolvedValueOnce(ok(' M src/foo.ts\n?? src/bar.ts\n'));
    const files = await getChangedFiles();
    expect(files).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('returns empty array when git fails', async () => {
    mockExec.mockResolvedValueOnce(fail('not a repo'));
    const files = await getChangedFiles();
    expect(files).toEqual([]);
  });

  it('returns empty array for clean working tree', async () => {
    mockExec.mockResolvedValueOnce(ok(''));
    const files = await getChangedFiles();
    expect(files).toEqual([]);
  });
});

describe('stageFiles', () => {
  it('calls git add with quoted file paths', async () => {
    mockExec.mockResolvedValueOnce(ok());
    await stageFiles(['src/a.ts', 'src/b.ts']);
    expect(mockExec).toHaveBeenCalledWith(
      'git add "src/a.ts" "src/b.ts"',
      expect.any(Object),
    );
  });
});

describe('checkoutFiles', () => {
  it('calls git checkout -- with quoted file paths', async () => {
    mockExec.mockResolvedValueOnce(ok());
    await checkoutFiles(['src/a.ts']);
    expect(mockExec).toHaveBeenCalledWith(
      'git checkout -- "src/a.ts"',
      expect.any(Object),
    );
  });
});

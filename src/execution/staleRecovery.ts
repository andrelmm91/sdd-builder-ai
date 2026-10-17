import * as vscode from 'vscode';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { listFiles, readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';
import { isExecutionRunning } from '../commands/executeSpec';

export interface StaleSpec {
  specId: string;
  filePath: string;
}

/** Finds specs whose frontmatter status is `in_progress`. `filePath` is workspace-relative. */
export async function findStaleSpecs(): Promise<StaleSpec[]> {
  const files = await listFiles(`${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
  const stale: StaleSpec[] = [];
  for (const filePath of files) {
    const content = await readWorkspaceFile(filePath);
    if (!content) continue;
    try {
      const { data } = parseFrontmatter(content);
      if (data['status'] === 'in_progress') {
        stale.push({ specId: String(data['spec_id'] ?? filePath), filePath });
      }
    } catch {
      // skip unparseable specs
    }
  }
  return stale;
}

/** Offers to reset specs left `in_progress` by a previous session. No-op while an execution runs. */
export async function recoverStaleSpecs(): Promise<void> {
  if (isExecutionRunning()) return;

  const stale = await findStaleSpecs();
  if (stale.length === 0) return;

  const answer = await vscode.window.showWarningMessage(
    `${stale.length} spec(s) were left In Progress by a previous session.`,
    'Reset to Ready',
    'Ignore',
  );
  if (answer !== 'Reset to Ready') return;

  for (const { filePath } of stale) {
    const content = await readWorkspaceFile(filePath);
    if (!content) continue;
    const { data, body } = parseFrontmatter(content);
    data['status'] = 'ready';
    await writeWorkspaceFile(filePath, serializeFrontmatter(data, body));
  }
}

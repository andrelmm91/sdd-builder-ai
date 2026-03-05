import * as vscode from 'vscode';
import * as path from 'path';
import { getNextSpecId } from '../specs/specIdGenerator';
import { generateSpecFromTemplate, getTemplateDescription } from '../specs/templates';
import { listFiles } from '../utils/fileSystem';
import { getSpecPrefix } from '../config/extensionConfig';
import type { SpecTemplate } from '../specs/types';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../utils/constants';

export async function newSpec(): Promise<void> {
  const templates: SpecTemplate[] = ['feature', 'bugfix', 'refactor'];
  const picked = await vscode.window.showQuickPick(
    templates.map((t) => ({ label: t, description: getTemplateDescription(t) })),
    { placeHolder: 'Select a spec template' }
  );
  if (!picked) {
    return;
  }

  const template = picked.label as SpecTemplate;

  const title = await vscode.window.showInputBox({
    prompt: 'Enter spec title',
    placeHolder: 'e.g. Add user authentication',
  });
  if (title === undefined) {
    return;
  }

  const prefix = await getSpecPrefix();
  const existingFiles = await listFiles(`${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
  const specIds = existingFiles
    .map((f) => {
      const base = path.basename(f, SPEC_FILE_EXTENSION);
      const match = /^([A-Za-z]+-\d+)/.exec(base);
      return match ? match[1] : '';
    })
    .filter(Boolean);

  const specId = getNextSpecId(specIds, prefix);
  const safeName = (title || specId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = `${specId}-${safeName}${SPEC_FILE_EXTENSION}`;
  const filePath = `${SPECS_FOLDER}/${fileName}`;

  const content = generateSpecFromTemplate({ template, specId, title: title || undefined });

  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const uri = vscode.Uri.joinPath(root, filePath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  await vscode.window.showTextDocument(uri);
}

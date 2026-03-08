import * as vscode from 'vscode';
import * as path from 'path';
import { parseSpec } from '../specs/parser';
import { validateSpec } from '../specs/validator';
import { transitionSpec } from '../specs/lifecycle';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';

export function createMarkReadyCommand(refresh: () => void) {
  return async (item?: SpecTreeItem | string): Promise<void> => {
    let filePath: string | undefined;
    if (typeof item === 'string') {
      filePath = item;
    } else if (item && item.kind === 'spec') {
      filePath = item.filePath;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.fileName.endsWith('.sdd.md')) {
        filePath = editor.document.fileName;
      }
    }

    if (!filePath) {
      vscode.window.showErrorMessage('No spec file selected or open.');
      return;
    }

    const uri = vscode.Uri.file(filePath);
    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch {
      vscode.window.showErrorMessage(`Could not read spec file: ${path.basename(filePath)}`);
      return;
    }

    const parseResult = parseSpec(content);
    if (!parseResult.success) {
      const msg = parseResult.errors.map((e) => e.message).join('; ');
      vscode.window.showErrorMessage(`Parse error: ${msg}`);
      return;
    }

    const doc = parseResult.data;

    const validationResult = validateSpec(doc);
    if (!validationResult.valid) {
      const errors = validationResult.errors.filter((e) => e.severity === 'error');
      const msg = errors.map((e) => e.message).join('\n');
      vscode.window.showErrorMessage(`Validation failed:\n${msg}`);
      return;
    }

    const transition = transitionSpec(doc.frontmatter, 'ready');
    if (!transition.success) {
      vscode.window.showErrorMessage(transition.error);
      return;
    }

    const { data, body } = parseFrontmatter(content);
    data['status'] = 'ready';
    const updated = serializeFrontmatter(data, body);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, 'utf8'));

    refresh();
    vscode.window.showInformationMessage(`Spec ${doc.frontmatter.spec_id} marked as Ready.`);
  };
}

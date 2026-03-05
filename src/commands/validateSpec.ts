import * as vscode from 'vscode';
import * as path from 'path';
import { parseSpec } from '../specs/parser';
import { validateSpec as runValidation } from '../specs/validator';
import type { SpecTreeItem } from '../views/sidebar/specTreeItem';

export function createValidateSpecCommand() {
  return async (item?: SpecTreeItem): Promise<void> => {
    let filePath: string | undefined;
    if (item && item.kind === 'spec') {
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

    const result = runValidation(parseResult.data);
    if (result.valid) {
      vscode.window.showInformationMessage(`✓ ${parseResult.data.frontmatter.spec_id} is valid.`);
    } else {
      const errorCount = result.errors.filter((e) => e.severity === 'error').length;
      const warnCount = result.errors.filter((e) => e.severity === 'warning').length;
      const msg = result.errors.map((e) => `[${e.severity}] ${e.message}`).join('\n');
      vscode.window.showErrorMessage(
        `Validation: ${errorCount} error(s), ${warnCount} warning(s).\n${msg}`
      );
    }
  };
}

import * as vscode from "vscode";
import * as path from "path";

const YAML_ARRAY_LINE = /^\s*-\s+(.*)$/;
const RELEVANT_FILES_SECTION = /^relevant_files\s*:/;
const MUST_NOT_TOUCH_SECTION = /^must_not_touch\s*:/;
const EXCLUDE_GLOB = "**/{node_modules,.git,dist,build}/**";

function isInsideFileListSection(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  for (let i = position.line; i >= 0; i--) {
    const text = document.lineAt(i).text;
    if (RELEVANT_FILES_SECTION.test(text) || MUST_NOT_TOUCH_SECTION.test(text)) {
      return true;
    }
    // Another top-level YAML key (not indented, not a list item, not a comment)
    if (i < position.line && /^[a-zA-Z_]/.test(text)) {
      return false;
    }
  }
  return false;
}

export class SpecCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const lineText = document.lineAt(position.line).text;

    // Only trigger on list item lines
    if (!YAML_ARRAY_LINE.test(lineText)) {
      return undefined;
    }

    if (!isInsideFileListSection(document, position)) {
      return undefined;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const root = workspaceFolders[0].uri;
    const files = await vscode.workspace.findFiles("**/*", EXCLUDE_GLOB, 5000);

    return files.map((fileUri) => {
      const relative = path.relative(root.fsPath, fileUri.fsPath).replace(/\\/g, "/");
      const item = new vscode.CompletionItem(relative, vscode.CompletionItemKind.File);
      item.detail = "workspace file";
      return item;
    });
  }
}

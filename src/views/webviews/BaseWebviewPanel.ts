import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Abstract base class for SDD webview panels.
 * Handles panel lifecycle, HTML generation, and the webview↔extension message bus.
 */
export abstract class BaseWebviewPanel {
  protected panel: vscode.WebviewPanel;
  protected readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  constructor(
    extensionUri: vscode.Uri,
    viewType: string,
    title: string,
    column: vscode.ViewColumn = vscode.ViewColumn.One,
  ) {
    this.extensionUri = extensionUri;
    this.panel = vscode.window.createWebviewPanel(viewType, title, column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webviews')],
    });

    this.panel.webview.html = this.getHtml(viewType);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  /** Reveal the panel in the editor. */
  reveal(column?: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  /** Post a typed message to the webview. */
  protected post(type: string, data: unknown): void {
    void this.panel.webview.postMessage({ type, data });
  }

  /** Implemented by each subclass to handle inbound messages from the webview. */
  protected abstract handleMessage(message: { type: string; data: unknown }): void | Promise<void>;

  dispose(): void {
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private getHtml(entryName: string): string {
    const distDir = path.join(this.extensionUri.fsPath, 'dist', 'webviews');
    const jsFile = `${entryName}.js`;
    const jsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', jsFile),
    );

    // Collect CSS files produced by the build (entry-level asset files like entryName-*.css)
    let cssTag = '';
    try {
      const files = fs.readdirSync(distDir);
      const cssFile = files.find(
        (f) => f.startsWith(entryName) && f.endsWith('.css'),
      );
      if (cssFile) {
        const cssUri = this.panel.webview.asWebviewUri(
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', cssFile),
        );
        cssTag = `<link rel="stylesheet" href="${cssUri}">`;
      }
    } catch {
      // dist not built yet — webview will render without styles
    }

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${this.panel.webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${this.panel.webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${cssTag}
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

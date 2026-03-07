// Type-safe wrapper around the VS Code webview API

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = acquireVsCodeApi();

export function postMessage(type: string, data: unknown): void {
  vscodeApi.postMessage({ type, data });
}

export function onMessage(handler: (message: { type: string; data: unknown }) => void): void {
  window.addEventListener('message', (event) => {
    const message = event.data as { type: string; data: unknown };
    handler(message);
  });
}

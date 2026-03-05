import * as vscode from "vscode";
import { initProject } from "./commands/initProject";

export function activate(context: vscode.ExtensionContext): void {
  // SDD Platform extension activated
  context.subscriptions.push(
    vscode.commands.registerCommand("sdd.initProject", initProject)
  );
}

export function deactivate(): void {
  // Cleanup on deactivation
}

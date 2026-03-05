import * as vscode from "vscode";
import { initProject } from "./commands/initProject";
import { SpecTreeProvider } from "./views/sidebar/specTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  // SDD Platform extension activated
  const specTreeProvider = new SpecTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("sdd.specsTree", specTreeProvider),
    vscode.commands.registerCommand("sdd.refreshSpecs", () =>
      specTreeProvider.refresh()
    ),
    vscode.commands.registerCommand("sdd.initProject", initProject),
    specTreeProvider
  );
}

export function deactivate(): void {
  // Cleanup on deactivation
}

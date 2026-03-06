import * as vscode from "vscode";
import { initProject } from "./commands/initProject";
import { newSpec } from "./commands/newSpec";
import { createMarkReadyCommand } from "./commands/markReady";
import { createValidateSpecCommand } from "./commands/validateSpec";
import { SpecTreeProvider } from "./views/sidebar/specTreeProvider";
import { SpecCompletionProvider } from "./specs/completionProvider";

export function activate(context: vscode.ExtensionContext): void {
  // SDD Platform extension activated
  const specTreeProvider = new SpecTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("sdd.specsTree", specTreeProvider),
    vscode.commands.registerCommand("sdd.refreshSpecs", () =>
      specTreeProvider.refresh()
    ),
    vscode.commands.registerCommand("sdd.initProject", initProject),
    vscode.commands.registerCommand("sdd.newSpec", newSpec),
    vscode.commands.registerCommand(
      "sdd.markReady",
      createMarkReadyCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "sdd.validateSpec",
      createValidateSpecCommand()
    ),
    vscode.commands.registerCommand("sdd.executeSpec", () =>
      vscode.window.showInformationMessage("Execute: Coming soon (Phase 2)")
    ),
    vscode.commands.registerCommand("sdd.reviewSpec", () =>
      vscode.window.showInformationMessage("Review: Coming soon (Phase 3)")
    ),
    specTreeProvider,
    vscode.languages.registerCompletionItemProvider(
      { language: "sdd-spec" },
      new SpecCompletionProvider(),
      "-", " "
    )
  );
}

export function deactivate(): void {
  // Cleanup on deactivation
}

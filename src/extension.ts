import * as vscode from "vscode";
import { initProject } from "./commands/initProject";
import { newSpec } from "./commands/newSpec";
import { createMarkReadyCommand } from "./commands/markReady";
import { createValidateSpecCommand } from "./commands/validateSpec";
import { createExecuteSpecCommand } from "./commands/executeSpec";
import { planFromRequirements } from "./commands/planFromRequirements";
import { refinePlan } from "./commands/refinePlan";
import { SpecTreeProvider } from "./views/sidebar/specTreeProvider";
import { SpecCompletionProvider } from "./specs/completionProvider";
import { StatusBarManager } from "./views/statusBar";
import { activate as activateDiagnostics } from "./specs/diagnostics";

export function activate(context: vscode.ExtensionContext): void {
  // SDD Platform extension activated
  activateDiagnostics(context);
  const specTreeProvider = new SpecTreeProvider();
  const statusBarManager = new StatusBarManager();

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
    vscode.commands.registerCommand(
      "sdd.executeSpec",
      createExecuteSpecCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand("sdd.reviewSpec", () =>
      vscode.window.showInformationMessage("Review: Coming soon (Phase 3)")
    ),
    vscode.commands.registerCommand("sdd.openDashboard", () =>
      vscode.commands.executeCommand("workbench.view.extension.sdd-sidebar")
    ),
    vscode.commands.registerCommand("sdd.planFromRequirements", planFromRequirements),
    vscode.commands.registerCommand("sdd.refinePlan", refinePlan),
    specTreeProvider,
    statusBarManager,
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

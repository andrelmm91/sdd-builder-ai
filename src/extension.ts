import * as vscode from "vscode";
import { fileExists } from "./utils/fileSystem";
import { CONFIG_FILE } from "./utils/constants";
import { initProject } from "./commands/initProject";
import { newSpec } from "./commands/newSpec";
import { createMarkReadyCommand } from "./commands/markReady";
import { createValidateSpecCommand } from "./commands/validateSpec";
import { createExecuteSpecCommand } from "./commands/executeSpec";
import { planFromRequirements } from "./commands/planFromRequirements";
import { refinePlan } from "./commands/refinePlan";
import {
  createReviewSpecCommand,
  createApproveSpecCommand,
  createRequestChangesCommand,
  createRejectSpecCommand,
} from "./commands/reviewCommands";
import { SpecTreeProvider } from "./views/sidebar/specTreeProvider";
import { SpecCompletionProvider } from "./specs/completionProvider";
import { StatusBarManager } from "./views/statusBar";
import { activate as activateDiagnostics } from "./specs/diagnostics";
import { DashboardPanel } from "./views/webviews/dashboard/DashboardPanel";
import { KanbanPanel } from "./views/webviews/kanban/KanbanPanel";
import { SpecFormPanel } from "./views/webviews/specForm/SpecFormPanel";
import { AiConfigPanel } from "./views/webviews/aiConfig/AiConfigPanel";

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
    vscode.commands.registerCommand(
      "sdd.reviewSpec",
      createReviewSpecCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "sdd.approveSpec",
      createApproveSpecCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "sdd.requestChanges",
      createRequestChangesCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "sdd.rejectSpec",
      createRejectSpecCommand(() => specTreeProvider.refresh())
    ),
    vscode.commands.registerCommand("sdd.openDashboard", () =>
      DashboardPanel.createOrShow(context.extensionUri)
    ),
    vscode.commands.registerCommand("sdd.openKanbanBoard", () =>
      KanbanPanel.createOrShow(context.extensionUri)
    ),
    vscode.commands.registerCommand("sdd.newSpecForm", () =>
      SpecFormPanel.openForCreate(context.extensionUri)
    ),
    vscode.commands.registerCommand("sdd.openAiConfig", () =>
      AiConfigPanel.createOrShow(context.extensionUri)
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

  // Show walkthrough on first activation (before project is initialized)
  fileExists(CONFIG_FILE).then((initialized) => {
    if (!initialized) {
      vscode.commands.executeCommand('workbench.action.openWalkthrough', {
        category: 'andrelmm91.sdd-platform#sdd.gettingStarted',
      });
    }
  });
}

export function deactivate(): void {
  // Cleanup on deactivation
}

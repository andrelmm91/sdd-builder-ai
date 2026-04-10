import * as vscode from "vscode";
import { fileExists } from "./utils/fileSystem";
import { CONFIG_FILE } from "./utils/constants";
import { initProject } from "./commands/initProject";
import { newSpec } from "./commands/newSpec";
import { createMarkReadyCommand } from "./commands/markReady";
import { createValidateSpecCommand } from "./commands/validateSpec";
import { createExecuteSpecCommand, executeSingleSpec, requireFullPermissionForBulk } from "./commands/executeSpec";
import { BulkExecutionManager } from "./execution/bulkExecution";
import { planFromRequirements } from "./commands/planFromRequirements";
import { refinePlan } from "./commands/refinePlan";
import { idealizeRequirements } from "./commands/idealizeRequirements";
import { createSddCards } from "./commands/createSddCards";
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
import { RequirementBoardPanel } from "./views/webviews/requirementBoard/RequirementBoardPanel";
import { SpecFormPanel } from "./views/webviews/specForm/SpecFormPanel";
import { AiConfigPanel } from "./views/webviews/aiConfig/AiConfigPanel";

export function activate(context: vscode.ExtensionContext): void {
  // SDD Platform extension activated
  activateDiagnostics(context);
  const specTreeProvider = new SpecTreeProvider();
  const statusBarManager = new StatusBarManager();

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider({
      provideFileDecoration(uri): vscode.FileDecoration | undefined {
        if (uri.scheme === 'sdd-dashboard') {
          return { color: new vscode.ThemeColor('charts.green') };
        }
        return undefined;
      },
    }),
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
    vscode.commands.registerCommand("sdd.openRequirementBoard", () =>
      RequirementBoardPanel.createOrShow(context.extensionUri)
    ),
    vscode.commands.registerCommand("sdd.addToBulk", async (item?: import("./views/sidebar/specTreeItem").SpecTreeItem | string) => {
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
      // Derive specId from the file by parsing it
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const { parseSpec } = await import('./specs/parser');
        const result = parseSpec(Buffer.from(bytes).toString('utf8'));
        if (result.success) {
          const added = await BulkExecutionManager.getInstance().addSpec(result.data.frontmatter.spec_id, filePath);
          if (!added) {
            vscode.window.showWarningMessage(`${result.data.frontmatter.spec_id} could not be added to bulk queue (must be "ready" and not already queued).`);
          }
        }
      } catch {
        vscode.window.showErrorMessage('Failed to add spec to bulk queue.');
      }
    }),
    vscode.commands.registerCommand("sdd.executeAllBulk", async () => {
      if (!await requireFullPermissionForBulk()) return;
      const manager = BulkExecutionManager.getInstance();
      const refresh = () => specTreeProvider.refresh();
      await manager.executeAll(async (specId) => {
        const fp = manager.getFilePath(specId);
        if (!fp) return false;
        return executeSingleSpec(fp, refresh);
      });
    }),
    vscode.commands.registerCommand("sdd.planFromRequirements", planFromRequirements),
    vscode.commands.registerCommand("sdd.refinePlan", refinePlan),
    vscode.commands.registerCommand("sdd.idealizeRequirements", idealizeRequirements),
    vscode.commands.registerCommand("sdd.createSddCards", createSddCards),
    specTreeProvider,
    statusBarManager,
    vscode.languages.registerCompletionItemProvider(
      { language: "sdd-spec" },
      new SpecCompletionProvider(),
      "-", " "
    )
  );

  // Auto-init prompt on first activation
  fileExists(CONFIG_FILE).then(async (initialized) => {
    if (!initialized) {
      const answer = await vscode.window.showInformationMessage(
        'SDD: No project found in this workspace. Initialize now?',
        'Initialize',
        'Not now',
      );
      if (answer === 'Initialize') {
        await initProject();
      }
    }
  });
}

export function deactivate(): void {
  // Cleanup on deactivation
}

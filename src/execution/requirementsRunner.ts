import * as vscode from 'vscode';

/**
 * Shared active-terminal reference for the requirements workflow
 * (idealizeRequirements + createSddCards).
 *
 * Both commands register the terminal they open here so that the
 * RequirementBoardPanel can close it on behalf of the user when they
 * click the "Complete & Close Terminal" button on the card — exactly
 * mirroring how CliRunner.completeInteractive() works for SDD specs.
 */
let _activeTerminal: vscode.Terminal | null = null;

export function setActiveRequirementsTerminal(terminal: vscode.Terminal | null): void {
  _activeTerminal = terminal;
}

export function completeCurrentRequirementsExecution(): void {
  _activeTerminal?.dispose();
  _activeTerminal = null;
}

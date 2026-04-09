import * as vscode from 'vscode';

/**
 * Shared active-terminal reference for the requirements workflow
 * (idealizeRequirements + createSddCards).
 *
 * Both commands register the terminal they open here so that the
 * RequirementBoardPanel can close it on behalf of the user when they
 * click the "Complete" or "Cancel" button on the card — exactly
 * mirroring how CliRunner.completeInteractive() works for SDD specs.
 */
let _activeTerminal: vscode.Terminal | null = null;
let _onCancel: (() => void) | null = null;

export function setActiveRequirementsTerminal(
  terminal: vscode.Terminal | null,
  onCancel?: () => void,
): void {
  _activeTerminal = terminal;
  _onCancel = onCancel ?? null;
}

export function completeCurrentRequirementsExecution(): void {
  _onCancel = null;
  _activeTerminal?.dispose();
  _activeTerminal = null;
}

export function cancelCurrentRequirementsExecution(): void {
  _onCancel?.();
  _onCancel = null;
  _activeTerminal?.dispose();
  _activeTerminal = null;
}

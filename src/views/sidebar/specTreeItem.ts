import * as vscode from 'vscode';
import type { SpecData, SpecStatus } from '../../specs/types';

const STATUS_ICONS: Record<SpecStatus, string> = {
  draft: 'git-branch',
  ready: 'circle-outline',
  in_progress: 'sync',
  review: 'eye',
  done: 'pass-filled',
};

export const STATUS_LABELS: Record<SpecStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

export class DashboardButtonItem extends vscode.TreeItem {
  readonly kind = 'dashboard' as const;
  static readonly DECORATION_URI = vscode.Uri.parse('sdd-dashboard://button');

  constructor() {
    super('Open Dashboard', vscode.TreeItemCollapsibleState.None);
    this.resourceUri = DashboardButtonItem.DECORATION_URI;
    this.iconPath = new vscode.ThemeIcon('layout', new vscode.ThemeColor('charts.green'));
    this.contextValue = 'sdd-dashboard-button';
    this.command = {
      command: 'sdd.openDashboard',
      title: 'Open Dashboard',
    };
  }
}

export class SpecGroupItem extends vscode.TreeItem {
  readonly kind = 'group' as const;

  constructor(public readonly status: SpecStatus, public readonly count: number) {
    super(STATUS_LABELS[status], vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${count})`;
    this.contextValue = `sdd-group-${status}`;
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[status]);
  }
}

export class SpecTreeItem extends vscode.TreeItem {
  readonly kind = 'spec' as const;

  constructor(public readonly spec: SpecData, public readonly filePath: string) {
    super(`${spec.spec_id}: ${spec.title}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = spec.status;
    this.tooltip = buildTooltip(spec);
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[spec.status]);
    this.command = {
      command: 'vscode.open',
      title: 'Open Spec',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

function buildTooltip(spec: SpecData): string {
  const parts = [`Complexity: ${spec.complexity}`];
  if (spec.tags.length > 0) {
    parts.push(`Tags: ${spec.tags.join(', ')}`);
  }
  if (spec.depends_on.length > 0) {
    parts.push(`Depends on: ${spec.depends_on.join(', ')}`);
  }
  return parts.join('\n');
}

import * as vscode from 'vscode';
import { parseFrontmatter, serializeFrontmatter } from '../../../utils/frontmatter';
import { IDEALIZATION_FILENAME } from '../../../utils/constants';
import type { FeatureCard, FeatureData, FeatureFormData, FeatureStatus } from './types';

export function sanitizeFeatureName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function parseFeatureFile(content: string): { data: FeatureData; body: string } {
  const result = parseFrontmatter(content);
  const data: FeatureData = {
    status: (result.data['status'] as FeatureStatus) ?? 'Feature Backlog',
    date: (result.data['date'] as string) ?? '',
  };
  return { data, body: result.body };
}

export async function loadFeatureCards(productFolderUri: vscode.Uri): Promise<FeatureCard[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(productFolderUri);
  } catch {
    return [];
  }

  const cards: FeatureCard[] = [];

  for (const [entryName, fileType] of entries) {
    if (fileType !== vscode.FileType.Directory) {
      continue;
    }

    const folderUri = vscode.Uri.joinPath(productFolderUri, entryName);
    const idealizationUri = vscode.Uri.joinPath(folderUri, IDEALIZATION_FILENAME);
    const featureFileUri = vscode.Uri.joinPath(folderUri, `${entryName}.md`);

    let hasIdealization = false;
    let status: FeatureStatus = 'Feature Backlog';
    let displayFilePath: string;

    try {
      const idealizationBytes = await vscode.workspace.fs.readFile(idealizationUri);
      const idealizationContent = new TextDecoder().decode(idealizationBytes);
      const { data } = parseFeatureFile(idealizationContent);
      hasIdealization = true;
      status = data.status;
      displayFilePath = idealizationUri.fsPath;
    } catch {
      // No idealization.md — try the feature file
      try {
        const featureBytes = await vscode.workspace.fs.readFile(featureFileUri);
        const featureContent = new TextDecoder().decode(featureBytes);
        const { data } = parseFeatureFile(featureContent);
        if (data.status !== 'Feature Backlog') {
          // Only show on board if status is "Feature Backlog" when no idealization
          continue;
        }
        displayFilePath = featureFileUri.fsPath;
      } catch {
        console.warn(`[featureParser] Skipping folder "${entryName}": could not read feature file`);
        continue;
      }
    }

    cards.push({
      name: entryName,
      title: entryName,
      status,
      filePath: displayFilePath!,
      folderPath: folderUri.fsPath,
      hasIdealization,
    });
  }

  return cards;
}

export async function createFeatureFile(
  productFolderUri: vscode.Uri,
  formData: FeatureFormData,
): Promise<string> {
  const safeName = sanitizeFeatureName(formData.name);
  const folderUri = vscode.Uri.joinPath(productFolderUri, safeName);
  const fileUri = vscode.Uri.joinPath(folderUri, `${safeName}.md`);

  const today = new Date().toISOString().slice(0, 10);
  const frontmatterData: Record<string, unknown> = {
    status: 'Feature Backlog',
    date: today,
  };

  const bodyParts: string[] = [`## Description\n\n${formData.description}`];
  bodyParts.push(`## Acceptance Criteria\n\n${formData.acceptanceCriteria}`);
  if (formData.notes) {
    bodyParts.push(`## Notes\n\n${formData.notes}`);
  }

  const content = serializeFrontmatter(frontmatterData, bodyParts.join('\n\n'));
  await vscode.workspace.fs.createDirectory(folderUri);
  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));

  return fileUri.fsPath;
}

export async function updateFeatureStatus(
  fileUri: vscode.Uri,
  newStatus: FeatureStatus,
): Promise<void> {
  const bytes = await vscode.workspace.fs.readFile(fileUri);
  const content = new TextDecoder().decode(bytes);
  const { data, body } = parseFrontmatter(content);

  const today = new Date().toISOString().slice(0, 10);
  const updated: Record<string, unknown> = { ...data, status: newStatus, date: today };

  const newContent = serializeFrontmatter(updated, body);
  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(newContent));
}

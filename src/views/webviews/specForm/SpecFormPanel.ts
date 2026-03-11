import * as vscode from 'vscode';
import * as path from 'path';
import { BaseWebviewPanel } from '../BaseWebviewPanel';
import { parseSpec } from '../../../specs/parser';
import { getNextSpecId } from '../../../specs/specIdGenerator';
import { serializeFrontmatter } from '../../../utils/frontmatter';
import { listFiles, getWorkspaceRoot } from '../../../utils/fileSystem';
import { SPECS_FOLDER, SPEC_FILE_EXTENSION } from '../../../utils/constants';
import { listAvailableSkills } from '../../../execution/skillsLoader';
import type { SpecDocument } from '../../../specs/types';

interface FormData {
  spec_id: string;
  title: string;
  status: string;
  priority: string;
  complexity: string;
  tags: string[];
  agent_skills: string;
  relevant_files: string[];
  must_not_touch: string[];
  depends_on: string[];
  budget_max_tokens: number;
  created: string;
  context: string;
  functionalRequirements: string;
  nonFunctionalRequirements: string;
  automatedCriteria: string;
  manualCriteria: string;
  constraints: string;
  examples: string;
}

export class SpecFormPanel extends BaseWebviewPanel {
  private static instance: SpecFormPanel | undefined;
  private editFilePath: string | undefined;

  static async openForCreate(extensionUri: vscode.Uri): Promise<void> {
    if (SpecFormPanel.instance) {
      SpecFormPanel.instance.dispose();
    }
    const panel = new SpecFormPanel(extensionUri, 'New Spec', undefined);
    SpecFormPanel.instance = panel;

    const specId = await panel.generateNextSpecId();
    const [allSpecIds, availableSkills] = await Promise.all([
      panel.loadAllSpecIds(),
      listAvailableSkills(),
    ]);
    panel.post('initForm', {
      mode: 'create',
      specId,
      allSpecIds,
      availableSkills,
      formData: null,
    });
  }

  static async openForEdit(extensionUri: vscode.Uri, filePath: string): Promise<void> {
    if (SpecFormPanel.instance) {
      SpecFormPanel.instance.dispose();
    }
    const uri = vscode.Uri.file(filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString('utf8');
    const result = parseSpec(content);
    if (!result.success) {
      vscode.window.showErrorMessage(`Failed to parse spec: ${result.errors[0].message}`);
      return;
    }

    const doc = result.data;
    const panel = new SpecFormPanel(
      extensionUri,
      `Edit: ${doc.frontmatter.spec_id}`,
      filePath,
    );
    SpecFormPanel.instance = panel;

    const [allSpecIds, availableSkills] = await Promise.all([
      panel.loadAllSpecIds(),
      listAvailableSkills(),
    ]);
    panel.post('initForm', {
      mode: 'edit',
      specId: doc.frontmatter.spec_id,
      filePath,
      allSpecIds,
      availableSkills,
      formData: specDocToFormData(doc),
    });
  }

  private constructor(
    extensionUri: vscode.Uri,
    title: string,
    editFilePath: string | undefined,
  ) {
    super(extensionUri, 'sddSpecForm', title, vscode.ViewColumn.One);
    this.editFilePath = editFilePath;
  }

  protected async handleMessage(message: { type: string; data: unknown }): Promise<void> {
    switch (message.type) {
      case 'saveSpec':
        await this.handleSave(message.data as FormData);
        break;
      case 'openFile':
        await this.handleOpenFile((message.data as { filePath: string }).filePath);
        break;
    }
  }

  override dispose(): void {
    SpecFormPanel.instance = undefined;
    super.dispose();
  }

  private async handleSave(formData: FormData): Promise<void> {
    try {
      const content = serializeSpecDocument(formData);
      let targetPath: string;

      if (this.editFilePath) {
        targetPath = this.editFilePath;
      } else {
        const root = getWorkspaceRoot();
        if (!root) throw new Error('No workspace folder open');
        const slug = slugify(formData.title);
        const fileName = `${formData.spec_id}-${slug}${SPEC_FILE_EXTENSION}`;
        targetPath = path.join(root, SPECS_FOLDER, fileName);
      }

      const uri = vscode.Uri.file(targetPath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

      this.post('saveSuccess', { filePath: targetPath });
      await vscode.commands.executeCommand('sdd.refreshSpecs');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post('saveError', { message });
    }
  }

  private async handleOpenFile(filePath: string): Promise<void> {
    await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  }

  private async generateNextSpecId(): Promise<string> {
    const existingIds = await this.loadAllSpecIds();
    const prefix = vscode.workspace
      .getConfiguration('sdd')
      .get<string>('specPrefix', 'SDD');
    return getNextSpecId(existingIds, prefix);
  }

  private async loadAllSpecIds(): Promise<string[]> {
    const files = await listFiles(`${SPECS_FOLDER}/**/*${SPEC_FILE_EXTENSION}`);
    const ids: string[] = [];
    for (const file of files) {
      const match = path.basename(file).match(/^([A-Z]+-\d+)/);
      if (match) ids.push(match[1]);
    }
    return ids;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function specDocToFormData(doc: SpecDocument): FormData {
  return {
    ...doc.frontmatter,
    context: doc.context,
    functionalRequirements: doc.functionalRequirements,
    nonFunctionalRequirements: doc.nonFunctionalRequirements,
    automatedCriteria: doc.automatedCriteria,
    manualCriteria: doc.manualCriteria,
    constraints: doc.constraints,
    examples: doc.examples,
  };
}

function serializeSpecDocument(f: FormData): string {
  const frontmatterData: Record<string, unknown> = {
    spec_id: f.spec_id,
    title: f.title,
    status: f.status,
    priority: f.priority,
    complexity: f.complexity,
    tags: Array.isArray(f.tags) ? f.tags : [],
    relevant_files: f.relevant_files,
    must_not_touch: f.must_not_touch,
    depends_on: f.depends_on,
    budget_max_tokens: f.budget_max_tokens,
    agent_skills: f.agent_skills,
    created: f.created || new Date().toISOString().slice(0, 10),
  };

  const sections: string[] = [];

  const addSection = (heading: string, content: string): void => {
    sections.push(`## ${heading}\n\n${content.trim()}\n`);
  };

  const addSubSection = (heading: string, content: string): void => {
    sections.push(`### ${heading}\n\n${content.trim()}\n`);
  };

  if (f.context) addSection('Context', f.context);

  if (f.functionalRequirements || f.nonFunctionalRequirements) {
    sections.push('## Requirements\n');
    if (f.functionalRequirements) addSubSection('Functional', f.functionalRequirements);
    if (f.nonFunctionalRequirements) addSubSection('Non-Functional', f.nonFunctionalRequirements);
  }

  if (f.automatedCriteria || f.manualCriteria) {
    sections.push('## Acceptance Criteria\n');
    if (f.automatedCriteria) addSubSection('Automated', f.automatedCriteria);
    if (f.manualCriteria) addSubSection('Manual', f.manualCriteria);
  }

  if (f.constraints) addSection('Constraints', f.constraints);
  if (f.examples) addSection('Examples', f.examples);

  const body = sections.join('\n');
  return serializeFrontmatter(frontmatterData, body, ['tags']);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

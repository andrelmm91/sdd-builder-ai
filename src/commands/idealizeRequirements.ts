import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { getClaudeCliBinary } from '../config/extensionConfig';
import { readAIConfig } from '../config/aiConfig';
import { IDEALIZATION_FILENAME, PRODUCT_FOLDER } from '../utils/constants';
import { updateFeatureStatus } from '../views/webviews/requirementBoard/featureParser';
import { isCommandAvailable } from '../utils/shell';
import { buildCliCommand } from '../execution/cliCommandBuilder';

const IDEALIZATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function idealizeRequirements(featureName: string, folderPath: string): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('SDD: No workspace folder is open.');
    return;
  }

  const featureRelativePath = `${PRODUCT_FOLDER}/${featureName}/${featureName}.md`;
  const prompt = buildIdealizePrompt(featureRelativePath);

  const tempPromptPath = path.join(root, `.sdd/tmp/idealize-${Date.now()}.md`);
  const promptFileUri = vscode.Uri.file(tempPromptPath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(tempPromptPath)));
  await vscode.workspace.fs.writeFile(promptFileUri, new TextEncoder().encode(prompt));

  const cliBinary = getClaudeCliBinary();
  const available = await isCommandAvailable(cliBinary);
  if (!available) {
    vscode.window.showErrorMessage(
      `SDD: AI CLI not found: "${cliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
    );
    try { await vscode.workspace.fs.delete(promptFileUri); } catch { /* ignore */ }
    return;
  }

  const aiConfig = await readAIConfig();
  const command = buildCliCommand({
    cliBinary,
    aiConfig,
    promptArg: `"$(cat '${tempPromptPath}')"`,
  });

  await runInTerminal(command, root, featureName, async () => {
    try {
      await postValidate(root, featureName, folderPath);
      vscode.window.showInformationMessage(`SDD: Idealization complete for "${featureName}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`SDD: Post-validation failed — ${message}`);
    }
  });

  try { await vscode.workspace.fs.delete(promptFileUri); } catch { /* ignore */ }
}

function runInTerminal(
  command: string,
  cwd: string,
  featureName: string,
  onSuccess: () => Promise<void>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number | void>();

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,
      open: () => {
        const child = cp.spawn(command, [], { shell: true, cwd });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          writeEmitter.fire('\r\n[SDD] Idealization timed out.\r\n');
          closeEmitter.fire(1);
        }, IDEALIZATION_TIMEOUT_MS);

        const onData = (chunk: Buffer | string) => {
          writeEmitter.fire(chunk.toString().replace(/\n/g, '\r\n'));
        };

        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);

        child.on('close', (code) => {
          clearTimeout(timeout);
          writeEmitter.fire(`\r\n[SDD] Process exited with code ${code}.\r\n`);
          closeEmitter.fire(code ?? 1);
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          writeEmitter.fire(`\r\n[SDD] Error: ${err.message}\r\n`);
          closeEmitter.fire(1);
        });
      },
      close: () => { /* user closed the terminal */ },
    };

    const terminal = vscode.window.createTerminal({
      name: `SDD: Idealize ${featureName}`,
      pty,
    });
    terminal.show();

    closeEmitter.event(async (exitCode) => {
      terminal.dispose();
      writeEmitter.dispose();
      closeEmitter.dispose();
      if (exitCode === 0) {
        await onSuccess();
      } else {
        vscode.window.showErrorMessage(
          `SDD: Idealization failed — AI CLI exited with code ${exitCode ?? 'unknown'}`,
        );
      }
      resolve();
    });
  });
}

function buildIdealizePrompt(featureRelativePath: string): string {
  return (
    `Based on the following feature description, acceptance criteria and notes\n` +
    `in @${featureRelativePath}, create a new markdown file\n` +
    `(named idealization.md) in the same folder with a concise idealization of this feature.\n` +
    `Make sure to include all the important information and recommendations.\n` +
    `The idealization should be clear and easy to understand for the development team.`
  );
}


async function postValidate(_root: string, featureName: string, folderPath: string): Promise<void> {
  const folderUri = vscode.Uri.file(folderPath);
  const idealizationUri = vscode.Uri.joinPath(folderUri, IDEALIZATION_FILENAME);
  const today = new Date().toISOString().slice(0, 10);

  // Ensure idealization.md exists; rename an AI-created .md file if needed
  let found = false;
  try {
    await vscode.workspace.fs.stat(idealizationUri);
    found = true;
  } catch {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith('.md') && name !== `${featureName}.md`) {
        await vscode.workspace.fs.rename(
          vscode.Uri.joinPath(folderUri, name),
          idealizationUri,
          { overwrite: true },
        );
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new Error(`idealization.md was not created in ${folderPath}`);
  }

  // Ensure frontmatter has status: "Idealization In Review" and date
  const bytes = await vscode.workspace.fs.readFile(idealizationUri);
  const content = new TextDecoder().decode(bytes);
  const { data, body } = parseFrontmatter(content);

  if (data['status'] !== 'Idealization In Review' || !data['date']) {
    const updated: Record<string, unknown> = { ...data, status: 'Idealization In Review', date: today };
    const newContent = serializeFrontmatter(updated, body);
    await vscode.workspace.fs.writeFile(idealizationUri, new TextEncoder().encode(newContent));
  }

  // Update original feature file status
  const featureFileUri = vscode.Uri.joinPath(folderUri, `${featureName}.md`);
  await updateFeatureStatus(featureFileUri, 'Idealization In Review');
}

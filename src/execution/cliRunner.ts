import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { writeWorkspaceFile, fileExists, getWorkspaceRoot } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import type { SpecDocument } from '../specs/types';
import type { ExecutionConfig, ExecutionResult, ExecutionRunner } from './types';
import type { AIConfig } from '../config/aiConfigTypes';
import { DEFAULT_PRE_PROMPT } from '../config/aiConfigTypes';
import { getSkillsPath } from './skillsLoader';
import { SPECS_FOLDER } from '../utils/constants';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Wraps a string in single quotes, escaping any internal single quotes. */
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// Matches token usage lines emitted by claude CLI:
//   "Tokens: in=1234 out=5678"  OR  "tokens_input: 1234 / tokens_output: 5678"
const TOKEN_PATTERN = /(?:tokens?[\s:_]*in(?:put)?[\s=:]*(\d+).*?out(?:put)?[\s=:]*(\d+))/i;

export class CliRunner implements ExecutionRunner {
  private _running = false;
  private _process: cp.ChildProcess | null = null;
  private _aborted = false;

  isRunning(): boolean {
    return this._running;
  }

  abort(): void {
    this._aborted = true;
    if (this._process) {
      this._process.kill('SIGTERM');
      this._process = null;
    }
    this._running = false;
  }

  async execute(
    spec: SpecDocument,
    context: string,
    config: ExecutionConfig,
    aiConfig?: AIConfig,
    specFilePath?: string,
  ): Promise<ExecutionResult> {
    if (this._running) {
      return { success: false, output: '', tokensIn: 0, tokensOut: 0, duration: 0, error: 'Already running' };
    }

    this._aborted = false;
    this._running = true;
    const startTime = Date.now();

    const specId = spec.frontmatter.spec_id;
    const contextFile = `.sdd/context-${specId}.md`;

    try {
      // Pre-flight: ensure claude CLI is available
      const cliAvailable = await isCommandAvailable(config.claudeCliBinary);
      if (!cliAvailable) {
        return this._fail(
          startTime,
          `Claude CLI not found: "${config.claudeCliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
        );
      }

      // Write assembled context to temp file
      await writeWorkspaceFile(contextFile, context);

      const root = getWorkspaceRoot();
      if (!root) {
        return this._fail(startTime, 'No workspace folder is open');
      }

      const contextFilePath = path.join(root, contextFile);
      const command = await this._buildCommand(spec, config, aiConfig, specFilePath);

      // Collect output chunks both for capture and terminal display
      const outputChunks: string[] = [];

      // SDD-026 compliance note: The VS Code Terminal API is used via a Pseudoterminal
      // for user-visible output. The underlying process is spawned with child_process
      // because the stable VS Code Terminal API does not expose an output-capture stream
      // (vscode.window.onDidWriteTerminalData is a proposed API). This hybrid approach
      // satisfies the spec's intent — all terminal display goes through VS Code — while
      // enabling programmatic result capture for token counting and log storage.
      await new Promise<void>((resolve, reject) => {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number | void>();

        const pty: vscode.Pseudoterminal = {
          onDidWrite: writeEmitter.event,
          onDidClose: closeEmitter.event,
          open: () => {
            // Show the exact command being run so failures are diagnosable
            writeEmitter.fire(`[SDD] Running: ${command}\r\n\r\n`);

            // Use the user's login shell so PATH includes nvm, homebrew, etc.
            const userShell = process.env.SHELL || '/bin/zsh';
            const child = cp.spawn(userShell, ['-l', '-c', command], {
              cwd: root,
            });
            this._process = child;

            const timeout = setTimeout(() => {
              child.kill('SIGTERM');
              writeEmitter.fire('\r\n[SDD] Execution timed out.\r\n');
              closeEmitter.fire(1);
            }, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

            const onData = (chunk: Buffer | string) => {
              const text = chunk.toString();
              outputChunks.push(text);
              // Convert LF → CRLF for terminal display
              writeEmitter.fire(text.replace(/\n/g, '\r\n'));
            };

            child.stdout?.on('data', onData);
            child.stderr?.on('data', onData);

            child.on('close', (code) => {
              clearTimeout(timeout);
              this._process = null;
              writeEmitter.fire(`\r\n[SDD] Process exited with code ${code}.\r\n`);
              closeEmitter.fire(code ?? 0);
            });

            child.on('error', (err) => {
              clearTimeout(timeout);
              this._process = null;
              writeEmitter.fire(`\r\n[SDD] Error: ${err.message}\r\n`);
              closeEmitter.fire(1);
            });
          },
          close: () => {
            if (this._process) {
              this._process.kill('SIGTERM');
              this._process = null;
            }
          },
        };

        const terminal = vscode.window.createTerminal({
          name: `SDD: ${specId}`,
          pty,
        });
        terminal.show();

        closeEmitter.event((exitCode) => {
          writeEmitter.dispose();
          closeEmitter.dispose();
          // Do NOT dispose the terminal — keep it visible so the user can
          // read the output. VS Code will mark it as "[terminated]" automatically.
          if (typeof exitCode === 'number' && exitCode !== 0 && !this._aborted) {
            reject(new Error(`Process exited with code ${exitCode}`));
          } else {
            resolve();
          }
        });
      });

      const output = outputChunks.join('');
      const { tokensIn, tokensOut } = parseTokenUsage(output);
      const duration = Date.now() - startTime;

      return { success: true, output, tokensIn, tokensOut, duration };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this._fail(startTime, message);
    } finally {
      this._running = false;
      // Clean up temp context file
      try {
        const root = getWorkspaceRoot();
        if (root) {
          const exists = await fileExists(contextFile);
          if (exists) {
            await vscode.workspace.fs.delete(vscode.Uri.file(path.join(root, contextFile)));
          }
        }
      } catch {
        // best-effort cleanup — do not mask the original result
      }
    }
  }

  private async _buildCommand(
    spec: SpecDocument,
    config: ExecutionConfig,
    aiConfig: AIConfig | undefined,
    specFilePath?: string,
  ): Promise<string> {
    const fm = spec.frontmatter;
    const provider = aiConfig?.provider ?? 'claude';

    // Use the actual file path (with slug) if provided; fall back to ID-only name
    const resolvedSpecPath = specFilePath ?? `${SPECS_FOLDER}/${fm.spec_id}.sdd.md`;
    const fileRef = provider === 'copilot'
      ? `#file:${resolvedSpecPath}`
      : `@${resolvedSpecPath}`;

    // --- Build prompt ---
    const promptParts: string[] = [];

    // 1. Pre-prompt: {spec_file} resolves to the provider-appropriate file reference
    const prePrompt = (aiConfig?.prePromptTemplate ?? DEFAULT_PRE_PROMPT)
      .replace(/\{spec_file\}/g, fileRef);
    promptParts.push(prePrompt);

    // 2. Tag-skill mappings: only for tags present on this spec
    if (aiConfig?.tagSkillMappings?.length) {
      const specTags = new Set(fm.tags ?? []);
      const matchedSkills = [
        ...new Set(
          aiConfig.tagSkillMappings
            .filter((m) => specTags.has(m.tag))
            .map((m) => m.skill),
        ),
      ];
      for (const skillName of matchedSkills) {
        const skillPath = await getSkillsPath(skillName);
        if (skillPath) {
          promptParts.push(`Use skills in ${skillPath}`);
        }
      }
    }

    // 3. Post-execution commands (only when enabled and non-empty)
    if (aiConfig?.commitCommandEnabled && aiConfig.commitCommand) {
      const cmd = aiConfig.commitCommand
        .replace(/\{spec_id\}/g, fm.spec_id)
        .replace(/\{title\}/g, fm.title);
      promptParts.push(`After completion run: \`${cmd}\``);
    }
    if (aiConfig?.prCommandEnabled && aiConfig.prCommand) {
      const cmd = aiConfig.prCommand
        .replace(/\{spec_id\}/g, fm.spec_id)
        .replace(/\{title\}/g, fm.title);
      promptParts.push(`After completion run: \`${cmd}\``);
    }

    const prompt = promptParts.join(' ');

    // --- Build CLI command ---

    if (provider === 'copilot') {
      const parts = ['gh', 'copilot'];
      if (aiConfig?.model) parts.push('--model', aiConfig.model);
      if (aiConfig?.permissionMode === 'yolo') parts.push('--yolo');
      parts.push('-p', sq(prompt));
      return parts.join(' ');
    }

    // Claude provider
    const parts = [config.claudeCliBinary, '--print'];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
      parts.push('--dangerously-skip-permissions');
    } else if (aiConfig?.permissionMode === 'plan') {
      parts.push('--plan');
    }
    parts.push(sq(prompt));
    return parts.join(' ');
  }

  private _fail(startTime: number, error: string): ExecutionResult {
    this._running = false;
    return { success: false, output: '', tokensIn: 0, tokensOut: 0, duration: Date.now() - startTime, error };
  }
}

export function parseTokenUsage(output: string): { tokensIn: number; tokensOut: number } {
  const match = TOKEN_PATTERN.exec(output);
  if (match) {
    return { tokensIn: parseInt(match[1], 10), tokensOut: parseInt(match[2], 10) };
  }
  return { tokensIn: 0, tokensOut: 0 };
}

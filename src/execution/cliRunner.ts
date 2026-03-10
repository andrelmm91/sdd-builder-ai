import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeWorkspaceFile, fileExists, getWorkspaceRoot } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import type { SpecDocument } from '../specs/types';
import type { ExecutionConfig, ExecutionResult, ExecutionRunner } from './types';
import type { AIConfig } from '../config/aiConfigTypes';
import { DEFAULT_PRE_PROMPT } from '../config/aiConfigTypes';
import { getSkillsPath } from './skillsLoader';
import { SPECS_FOLDER, EXECUTIONS_FOLDER } from '../utils/constants';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SENTINEL_POLL_MS = 500;

/** Wraps a string in single quotes, escaping any internal single quotes. */
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// Matches token usage lines emitted by claude CLI. Supports two formats:
//   "Tokens: in=1234 out=5678"        (older claude CLI)
//   "tokens_input: 1234 / tokens_output: 5678"  (newer claude CLI / copilot)
const TOKEN_PATTERN =
  /Tokens:\s*in=(\d+)\s+out=(\d+)|tokens_input:\s*(\d+)\s*\/\s*tokens_output:\s*(\d+)/i;

export class CliRunner implements ExecutionRunner {
  private _running = false;
  private _terminal: vscode.Terminal | null = null;
  private _aborted = false;

  isRunning(): boolean {
    return this._running;
  }

  abort(): void {
    this._aborted = true;
    if (this._terminal) {
      // Send Ctrl+C to interrupt the running process inside the real terminal
      this._terminal.sendText('\x03', false);
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
    // Unique temp-file paths so concurrent executions don't collide
    const ts = Date.now();
    const sentinel = path.join(os.tmpdir(), `sdd-${specId}-${ts}.sentinel`);
    // Persistent log: .sdd/executions/<specId>/exec-<ts>.log (kept after execution for auditing)
    const root2 = getWorkspaceRoot();
    const persistentLogDir = root2 ? path.join(root2, EXECUTIONS_FOLDER, specId) : os.tmpdir();
    fsSync.mkdirSync(persistentLogDir, { recursive: true });
    const logFile = path.join(persistentLogDir, `exec-${ts}.log`);

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

      const command = await this._buildCommand(spec, config, aiConfig, specFilePath);

      // Wrap the command so that:
      //   • `tee` captures stdout+stderr to a log file (for token parsing)
      //   • `set -o pipefail` makes $? reflect the original command's exit code, not tee's
      //   • A sentinel file is written with the exit code once the pipeline finishes
      // When the sentinel file appears, the log file is guaranteed to be fully flushed.
      const wrappedCommand =
        `set -o pipefail; ${command} 2>&1 | tee ${sq(logFile)}; echo $? > ${sq(sentinel)}`;

      // Create a REAL VS Code terminal so Claude sees a genuine PTY.
      // With a real PTY, plan/ask modes work interactively — the user can type responses
      // exactly as if they had pasted the command into their own terminal session.
      const terminal = vscode.window.createTerminal({
        name: `SDD: ${specId}`,
        cwd: root,
      });
      this._terminal = terminal;
      terminal.show();
      terminal.sendText(wrappedCommand);

      // Block until the sentinel file signals completion (or timeout / abort)
      await this._waitForCompletion(sentinel, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      // Read exit code written by the shell's `echo $?`
      let exitCode = 0;
      try {
        exitCode = parseInt((await fs.readFile(sentinel, 'utf8')).trim(), 10);
      } catch {
        // Missing on abort or timeout — treat as failure only when not aborted
      }

      // Give tee a moment to flush any buffered tail bytes before reading the log
      await new Promise<void>((r) => setTimeout(r, 150));
      const capturedOutput = await fs.readFile(logFile, 'utf8').catch(() => '');

      const { tokensIn, tokensOut } = parseTokenUsage(capturedOutput);
      const duration = Date.now() - startTime;

      if (exitCode !== 0 && !this._aborted) {
        return {
          success: false,
          output: capturedOutput,
          tokensIn,
          tokensOut,
          duration,
          error: `Process exited with code ${exitCode}`,
        };
      }

      return { success: true, output: capturedOutput, tokensIn, tokensOut, duration };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this._fail(startTime, message);
    } finally {
      this._running = false;
      this._terminal = null;
      // Clean up sentinel only; logFile is persisted to .sdd/executions/<specId>/
      await fs.unlink(sentinel).catch(() => {});
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

  /**
   * Polls every SENTINEL_POLL_MS for the sentinel file to appear.
   * Resolves when found, rejects on timeout, and resolves immediately when aborted.
   */
  private _waitForCompletion(sentinel: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        if (this._aborted) {
          clearInterval(poll);
          clearTimeout(timeoutHandle);
          resolve();
          return;
        }
        try {
          await fs.access(sentinel);
          // Sentinel exists → the wrapped command has finished
          clearInterval(poll);
          clearTimeout(timeoutHandle);
          resolve();
        } catch {
          // Not yet present — keep polling
        }
      }, SENTINEL_POLL_MS);

      const timeoutHandle = setTimeout(() => {
        clearInterval(poll);
        // Interrupt whatever is running in the terminal
        if (this._terminal) {
          this._terminal.sendText('\x03', false);
        }
        reject(new Error('Execution timed out'));
      }, timeoutMs);
    });
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

    // Normalize newlines to spaces so the shell argument never triggers readline's
    // `quote>` continuation prompt when the command is sent to the terminal.
    const prompt = promptParts.join(' ').replace(/\n+/g, ' ').trim();

    // --- Build CLI command ---

    if (provider === 'copilot') {
      const parts = ['gh', 'copilot'];
      if (aiConfig?.model) parts.push('--model', aiConfig.model);
      if (aiConfig?.permissionMode === 'yolo') parts.push('--yolo');
      parts.push('-p', sq(prompt));
      return parts.join(' ');
    }

    // Claude provider
    // No --print flag: the terminal is a real PTY so Claude runs interactively,
    // which is required for plan/ask modes to display prompts and receive user input.
    const parts = [config.claudeCliBinary];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
      parts.push('--dangerously-skip-permissions');
    }
    // plan mode: no extra flag — Claude's default interactive mode asks for tool approval
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
    // Group 1+2: "Tokens: in=N out=M" format; Group 3+4: "tokens_input: N / tokens_output: M" format
    const tokensIn = parseInt(match[1] ?? match[3], 10);
    const tokensOut = parseInt(match[2] ?? match[4], 10);
    return { tokensIn, tokensOut };
  }
  return { tokensIn: 0, tokensOut: 0 };
}

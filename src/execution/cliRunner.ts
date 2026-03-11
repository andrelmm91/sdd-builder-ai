import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import type { SpecDocument } from '../specs/types';
import type { ExecutionConfig, ExecutionResult, ExecutionRunner } from './types';
import type { AIConfig } from '../config/aiConfigTypes';
import { DEFAULT_PRE_PROMPT } from '../config/aiConfigTypes';
import { getSkillsPath } from './skillsLoader';
import { SPECS_FOLDER } from '../utils/constants';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SENTINEL_POLL_MS = 500;

/** Wraps a string in single quotes, escaping any internal single quotes. */
function sq(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

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
    config: ExecutionConfig,
    aiConfig?: Partial<AIConfig>,
    specFilePath?: string,
  ): Promise<ExecutionResult> {
    if (this._running) {
      return { success: false, output: '', duration: 0, error: 'Already running' };
    }

    this._aborted = false;
    this._running = true;
    const startTime = Date.now();

    const specId = spec.frontmatter.spec_id;
    const ts = Date.now();
    const sentinel = path.join(os.tmpdir(), `sdd-${specId}-${ts}.sentinel`);
    const logFile = path.join(os.tmpdir(), `sdd-${specId}-${ts}.log`);

    try {
      // Pre-flight: ensure claude CLI is available
      const cliAvailable = await isCommandAvailable(config.claudeCliBinary);
      if (!cliAvailable) {
        return this._fail(
          startTime,
          `Claude CLI not found: "${config.claudeCliBinary}". Install it or update sdd.claudeCliBinary in settings.`,
        );
      }

      const root = getWorkspaceRoot();
      if (!root) {
        return this._fail(startTime, 'No workspace folder is open');
      }

      const { command, terminalInput, interactive } = await this._buildCommand(spec, config, aiConfig, specFilePath);

      // For non-interactive (one-shot) commands, wrap so that:
      //  1. Output streams to the terminal AND is captured to a log file (via tee).
      //  2. The sentinel file gets the real exit code of the AI command.
      // Interactive commands (Claude ask/plan, Copilot default) stay in REPL —
      // the user signals completion via the "Complete & Close Terminal" button.
      const wrappedCommand = interactive
        ? command
        : `{ ${command}; echo $? > ${sq(sentinel)}; } 2>&1 | tee ${sq(logFile)}`;

      // Create a REAL VS Code terminal so Claude sees a genuine PTY.
      const terminal = vscode.window.createTerminal({
        name: `SDD: ${specId}`,
        cwd: root,
      });
      this._terminal = terminal;
      terminal.show();

      // Wait for shell to initialize before sending any text.
      // Without this delay, sendText fires before the PTY is ready and the
      // command text gets consumed by the shell incorrectly.
      await new Promise(resolve => setTimeout(resolve, 1000));
      terminal.sendText(wrappedCommand);

      // For providers that need the prompt delivered as separate terminal input,
      // wait for the CLI process to start before sending the prompt.
      if (terminalInput !== undefined) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        terminal.sendText(terminalInput);
      }

      if (interactive) {
        // Interactive modes: show a notification with a button so the user can
        // signal completion without having to close the terminal manually.
        vscode.window.showInformationMessage(
          `SDD: ${specId} is running interactively. Click below when the AI is done.`,
          'Complete & Close Terminal',
        ).then(selection => {
          if (selection && this._terminal) {
            this._terminal.dispose();
          }
        });
        await this._waitForTerminalClose(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        return { success: true, output: '', duration: Date.now() - startTime };
      }

      // Non-interactive: poll for sentinel file
      await this._waitForCompletion(sentinel, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      // Read exit code written inside the group command
      let exitCode = 0;
      try {
        exitCode = parseInt((await fs.readFile(sentinel, 'utf8')).trim(), 10);
      } catch {
        // Missing on abort or timeout — treat as failure only when not aborted
      }

      // Read captured output from the log file
      let logOutput = '';
      try {
        logOutput = await fs.readFile(logFile, 'utf8');
      } catch {
        // Log file absent (e.g. aborted early) — not critical
      }

      const duration = Date.now() - startTime;

      if (exitCode !== 0 && !this._aborted) {
        return {
          success: false,
          output: logOutput,
          duration,
          error: `Process exited with code ${exitCode}`,
        };
      }

      return { success: true, output: logOutput, duration };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this._fail(startTime, message);
    } finally {
      this._running = false;
      this._terminal = null;
      await fs.unlink(sentinel).catch(() => {});
      await fs.unlink(logFile).catch(() => {});
    }
  }

  /**
   * Polls every SENTINEL_POLL_MS for the sentinel file to appear.
   * Resolves when found, rejects on timeout, and resolves immediately when aborted.
   * Also resolves when the terminal closes (handles cases where the sentinel is never
   * written — e.g. dangerously-skip-permissions mode where the shell may not survive
   * to execute `echo $?`).
   */
  private _waitForCompletion(sentinel: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearInterval(poll);
        clearTimeout(timeoutHandle);
        terminalCloseDisposable.dispose();
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const poll = setInterval(async () => {
        if (this._aborted) {
          settle(resolve);
          return;
        }
        try {
          await fs.access(sentinel);
          // Sentinel exists → the wrapped command has finished
          settle(resolve);
        } catch {
          // Not yet present — keep polling
        }
      }, SENTINEL_POLL_MS);

      const timeoutHandle = setTimeout(() => {
        // Interrupt whatever is running in the terminal
        if (this._terminal) {
          this._terminal.sendText('\x03', false);
        }
        settle(() => reject(new Error('Execution timed out')));
      }, timeoutMs);

      // Resolve when the terminal closes — this handles the case where the shell
      // never writes the sentinel (e.g. dangerously-skip-permissions causes the
      // process to exit in a way that skips the trailing `echo $?`).
      const terminalCloseDisposable = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this._terminal) {
          settle(resolve);
        }
      });
    });
  }

  /**
   * Waits for the terminal to be closed by the user (interactive modes).
   * Resolves on terminal close or abort, rejects on timeout.
   */
  private _waitForTerminalClose(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearInterval(abortPoll);
        clearTimeout(timeoutHandle);
        terminalCloseDisposable.dispose();
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const abortPoll = setInterval(() => {
        if (this._aborted) {
          settle(resolve);
        }
      }, SENTINEL_POLL_MS);

      const timeoutHandle = setTimeout(() => {
        if (this._terminal) {
          this._terminal.sendText('\x03', false);
        }
        settle(() => reject(new Error('Execution timed out')));
      }, timeoutMs);

      const terminalCloseDisposable = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this._terminal) {
          settle(resolve);
        }
      });
    });
  }

  private async _buildCommand(
    spec: SpecDocument,
    config: ExecutionConfig,
    aiConfig: Partial<AIConfig> | undefined,
    specFilePath?: string,
  ): Promise<{ command: string; terminalInput?: string; interactive?: boolean }> {
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

      if (aiConfig?.permissionMode === 'yolo') {
        // Yolo mode: pass prompt via -p flag for non-interactive batch execution.
        parts.push('--yolo');
        parts.push('-p', sq(prompt));
        return { command: parts.join(' ') };
      }

      // Default (ask) mode: gh copilot is a TUI that pauses for permission on
      // each tool use — it must run in interactive mode, just like Claude default.
      // We pass the prompt via -p so it starts immediately, then wait for the
      // user to signal completion via the "Complete & Close Terminal" button.
      parts.push('-p', sq(prompt));
      return { command: parts.join(' '), interactive: true };
    }

    // Claude provider
    const parts = [config.claudeCliBinary];
    if (aiConfig?.model) parts.push('--model', aiConfig.model);
    if (aiConfig?.permissionMode === 'dangerously-skip-permissions') {
      // -p (print mode) makes Claude one-shot: execute and exit.
      // Without it, Claude enters REPL mode and the sentinel never runs.
      parts.push('-p', '--dangerously-skip-permissions');
    }
    parts.push(sq(prompt));

    // Default and plan modes are interactive — Claude stays in REPL,
    // user approves/denies tools. Sentinel won't work; use terminal close.
    const interactive = aiConfig?.permissionMode !== 'dangerously-skip-permissions';
    return { command: parts.join(' '), interactive };
  }

  private _fail(startTime: number, error: string): ExecutionResult {
    this._running = false;
    return { success: false, output: '', duration: Date.now() - startTime, error };
  }
}

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/fileSystem';
import { isCommandAvailable } from '../utils/shell';
import type { SpecDocument } from '../specs/types';
import type { ExecutionConfig, ExecutionResult, ExecutionRunner } from './types';
import type { AIConfig } from '../config/aiConfigTypes';
import { getProviderBinary, getCliNotFoundMessage } from '../config/extensionConfig';
import { getSkillsPath } from './skillsLoader';
import { EXECUTIONS_FOLDER, SPECS_FOLDER } from '../utils/constants';
import { buildExecutionPrompt } from './contextAssembler';
import { quoteBash, quoteForShell } from '../utils/shellQuote';
import {
  buildProviderCommand,
  formatFileRef,
  resolveProviderBinary,
  resolveProviderDefinition,
} from './providerCommand';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SENTINEL_POLL_MS = 500;

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

  /** Closes the terminal to signal successful completion of an interactive session. */
  completeInteractive(): void {
    if (this._terminal) {
      this._terminal.dispose();
    }
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
    let scriptPath: string | null = null;

    try {
      // Pre-flight: ensure the provider's CLI is available
      const providerBinary = getProviderBinary(aiConfig, config.claudeCliBinary);
      const cliAvailable = await isCommandAvailable(providerBinary);
      if (!cliAvailable) {
        return this._fail(startTime, getCliNotFoundMessage(aiConfig, providerBinary));
      }

      const root = getWorkspaceRoot();
      if (!root) {
        return this._fail(startTime, 'No workspace folder is open');
      }

      const promptFile = await this._writePromptFile(root, spec, aiConfig, specFilePath, ts);
      const { command, terminalInput, interactive } = this._buildCommand(config, aiConfig, promptFile.fileRef);

      // Interactive commands stay in REPL — the user signals completion by closing
      // the terminal ("Complete & Close Terminal" button in the Kanban UI).
      let terminal: vscode.Terminal;

      if (process.platform === 'win32') {
        // Windows: plain terminal (no shellPath override) so Claude's PTY detection
        // works correctly. The zsh ZLE init race that required a bash script on POSIX
        // does not exist for PowerShell, so sendText after a brief startup delay is safe.
        terminal = vscode.window.createTerminal({
          name: `SDD: ${specId}`,
          cwd: root,
        });
      } else {
        // POSIX: bash script to bypass the zsh ZLE init race (discards sendText on
        // WSL2/macOS and causes commands to exit 130/SIGINT).
        const wrappedCommand = interactive
          ? command
          : `{ ${command}; echo $? > ${quoteBash(sentinel)}; } 2>&1 | tee ${quoteBash(logFile)}`;
        let scriptContent = `#!/bin/bash\n${wrappedCommand}\n`;
        if (terminalInput !== undefined) {
          // Embed the prompt as stdin via a here-string so it reaches the CLI process
          // without any sendText timing dependency.
          scriptContent = `#!/bin/bash\n${wrappedCommand} <<< ${quoteBash(terminalInput)}\n`;
        }
        scriptContent += `exec "\${SHELL:-bash}"\n`;
        scriptPath = path.join(os.tmpdir(), `sdd-${specId}-${ts}-cmd.sh`);
        await fs.writeFile(scriptPath, scriptContent, { mode: 0o700 });
        terminal = vscode.window.createTerminal({
          name: `SDD: ${specId}`,
          cwd: root,
          shellPath: '/bin/bash',
          shellArgs: ['-l', scriptPath],
        });
      }

      this._terminal = terminal;
      terminal.show();

      if (process.platform === 'win32') {
        // Brief pause for PowerShell prompt to become ready before sending input.
        await new Promise<void>((r) => setTimeout(r, 500));
        if (interactive) {
          terminal.sendText(command);
        } else {
          terminal.sendText(
            `${command} 2>&1 | Tee-Object -FilePath ${quoteForShell(logFile)}; ` +
            `$LASTEXITCODE | Out-File -FilePath ${quoteForShell(sentinel)} -Encoding ascii`,
          );
        }
      }

      if (interactive) {
        // Interactive modes: the caller is responsible for showing any
        // notification and calling completeInteractive() when done.
        const closeCode = await this._waitForTerminalClose(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        // A non-zero exit (e.g. Claude stopped on the untrusted-folder prompt) must not reach review.
        if (closeCode && !this._aborted) {
          return {
            success: false,
            output: '',
            duration: Date.now() - startTime,
            error: `Process exited with code ${closeCode}`,
            promptFile: promptFile.relativePath,
          };
        }
        return { success: true, output: '', duration: Date.now() - startTime, promptFile: promptFile.relativePath };
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
          promptFile: promptFile.relativePath,
        };
      }

      return { success: true, output: logOutput, duration, promptFile: promptFile.relativePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this._fail(startTime, message);
    } finally {
      this._running = false;
      this._terminal = null;
      await fs.unlink(sentinel).catch(() => {});
      await fs.unlink(logFile).catch(() => {});
      if (scriptPath) await fs.unlink(scriptPath).catch(() => {});
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
  private _waitForTerminalClose(timeoutMs: number): Promise<number | undefined> {
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
          settle(() => resolve(undefined));
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
          settle(() => resolve(closed.exitStatus?.code));
        }
      });
    });
  }

  /**
   * Writes the full execution instructions document to
   * `.sdd/executions/<specId>/prompt-<timestamp>.md` and returns its workspace-relative
   * path plus the provider-specific file reference. The file is kept as an audit trail.
   */
  private async _writePromptFile(
    root: string,
    spec: SpecDocument,
    aiConfig: Partial<AIConfig> | undefined,
    specFilePath: string | undefined,
    ts: number,
  ): Promise<{ relativePath: string; fileRef: string }> {
    const fm = spec.frontmatter;
    const def = resolveProviderDefinition(aiConfig);
    const toRef = (p: string) => formatFileRef(def, p);

    // Use the actual file path (with slug) if provided; fall back to ID-only name
    const resolvedSpecPath = (specFilePath ?? `${SPECS_FOLDER}/${fm.spec_id}.sdd.md`).split('\\').join('/');

    const skillPaths: string[] = [];
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
        if (skillPath) skillPaths.push(skillPath);
      }
    }

    const document = await buildExecutionPrompt(spec, {
      specFileRef: toRef(resolvedSpecPath),
      skillPaths,
      aiConfig: aiConfig as AIConfig | undefined,
    });

    const relativePath = `${EXECUTIONS_FOLDER}/${fm.spec_id}/prompt-${ts}.md`;
    const absolutePath = path.join(root, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, document, 'utf8');

    return { relativePath, fileRef: toRef(relativePath) };
  }

  private _buildCommand(
    config: ExecutionConfig,
    aiConfig: Partial<AIConfig> | undefined,
    promptFileRef: string,
  ): { command: string; terminalInput?: string; interactive?: boolean } {
    const def = resolveProviderDefinition(aiConfig);

    // The whole prompt lives in the instructions file; the CLI only gets this one line.
    const prompt = `Read and follow all instructions in ${promptFileRef}.`;

    // Batch modes are one-shot (the sentinel runs afterwards); interactive modes stay in
    // the REPL and completion is signalled by closing the terminal.
    return buildProviderCommand(def, {
      permissionModeId: aiConfig?.permissionMode ?? 'default',
      prompt,
      model: aiConfig?.model,
      binaryOverride: resolveProviderBinary(def, config.claudeCliBinary),
    });
  }

  private _fail(startTime: number, error: string): ExecutionResult {
    this._running = false;
    return { success: false, output: '', duration: Date.now() - startTime, error };
  }
}

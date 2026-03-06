import * as path from 'path';
import { getWorkspaceRoot, readWorkspaceFile, writeWorkspaceFile } from '../utils/fileSystem';
import { execCommand, isCommandAvailable } from '../utils/shell';
import { parseFrontmatter } from '../utils/frontmatter';
import { SKILLS_FOLDER } from '../utils/constants';
import { assemblePlanContext } from './planContextAssembler';
import { parsePlannerOutput, writeSpecBatch } from './specBatchWriter';
import { validateDependencies } from './dependencyResolver';
import type { PlanningRequest, PlanningResult, GeneratedSpec } from './types';
import type { SpecData } from '../specs/types';

const PLANNING_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes
const CONTEXT_FILE = '.sdd/plan-context.md';

/** Candidate skill file paths, checked in order. */
const SKILLS_CANDIDATES = [
  `${SKILLS_FOLDER}/sdd-planner.md`,
  '.claude/skills/sdd-planner.md',
];

export type ProgressCallback = (message: string) => void;

/** Token usage extracted from Claude CLI output when available. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export class PlannerOrchestrator {
  constructor(private readonly onProgress?: ProgressCallback) {}

  /** Runs the full planning pipeline from requirements to spec files. */
  plan(request: PlanningRequest): Promise<PlanningResult> {
    return this.runPipeline(request);
  }

  /** Re-runs the planning pipeline using feedback from a previous attempt. */
  refine(request: PlanningRequest): Promise<PlanningResult> {
    return this.runPipeline(request);
  }

  private async runPipeline(request: PlanningRequest): Promise<PlanningResult> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return { success: false, error: 'No workspace folder is open' };
    }

    // Step 1: Validate requirements
    const validationError = validateRequirements(request.requirements);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Step 2: Assemble planner context
    this.progress('Assembling planner context…');
    let contextContent: string;
    try {
      contextContent = await assemblePlanContext(request);
    } catch (err) {
      return { success: false, error: `Failed to assemble context: ${toMessage(err)}` };
    }

    // Step 3: Write context to temporary file
    try {
      await writeWorkspaceFile(CONTEXT_FILE, contextContent);
    } catch (err) {
      return { success: false, error: `Failed to write context file: ${toMessage(err)}` };
    }

    // Step 4: Invoke Claude CLI (cleanup temp file in finally)
    this.progress('Invoking Claude CLI…');
    let cliOutput: string;
    let invokeError: string | undefined;
    try {
      cliOutput = await this.invokeClaude(workspaceRoot);
    } catch (err) {
      invokeError = toMessage(err);
      cliOutput = '';
    } finally {
      await cleanupContextFile(workspaceRoot);
    }

    if (invokeError !== undefined) {
      return { success: false, error: invokeError };
    }

    // Report token usage via progress when present
    const usage = parseTokenUsage(cliOutput);
    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
      this.progress(
        `Token usage — input: ${usage.inputTokens ?? '?'}, output: ${usage.outputTokens ?? '?'}`
      );
    }

    // Step 5: Parse CLI output
    this.progress('Parsing planner output…');
    const generatedSpecs = parsePlannerOutput(cliOutput);
    if (generatedSpecs.length === 0) {
      return {
        success: false,
        error:
          'Claude CLI returned no spec definitions. Verify the skills file and review the context.',
      };
    }

    // Step 6: Write spec files
    this.progress(`Writing ${generatedSpecs.length} spec(s)…`);
    let writeResult: Awaited<ReturnType<typeof writeSpecBatch>>;
    try {
      writeResult = await writeSpecBatch(generatedSpecs, workspaceRoot);
    } catch (err) {
      return { success: false, error: `Failed to write spec files: ${toMessage(err)}` };
    }

    if (writeResult.errors.length > 0 && writeResult.written.length === 0) {
      const summary = writeResult.errors.map((e) => `${e.specId}: ${e.error}`).join('; ');
      return { success: false, error: `All spec writes failed: ${summary}` };
    }

    // Step 7: Validate dependencies (informational — does not block success)
    const specDatas = generatedSpecsToSpecData(generatedSpecs);
    validateDependencies(specDatas);

    this.progress('Done.');
    return { success: true, specs: generatedSpecs };
  }

  private async invokeClaude(workspaceRoot: string): Promise<string> {
    const available = await isCommandAvailable('claude');
    if (!available) {
      throw new Error(
        'Claude CLI is not installed or not found in PATH. Install it with: npm install -g @anthropic-ai/claude-cli'
      );
    }

    const contextAbsPath = path.join(workspaceRoot, CONTEXT_FILE);
    const skillsFile = await this.findSkillsFile(workspaceRoot);

    // Build command — use shell input redirection so the context file content
    // is fed to Claude as stdin, keeping argument length well under OS limits.
    const systemFlag = skillsFile ? `--system-prompt "${skillsFile}" ` : '';
    const command = `claude --print ${systemFlag}< "${contextAbsPath}"`;

    const result = await execCommand(command, {
      cwd: workspaceRoot,
      timeout: PLANNING_TIMEOUT_MS,
    });

    if (!result.success) {
      if (result.exitCode === 124) {
        throw new Error('Claude CLI timed out after 5 minutes');
      }
      const detail = result.stderr?.trim() || `Process exited with code ${result.exitCode}`;
      throw new Error(`Claude CLI failed: ${detail}`);
    }

    return result.stdout;
  }

  private async findSkillsFile(workspaceRoot: string): Promise<string | undefined> {
    for (const relativePath of SKILLS_CANDIDATES) {
      const content = await readWorkspaceFile(relativePath);
      if (content !== undefined) {
        return path.join(workspaceRoot, relativePath);
      }
    }
    return undefined;
  }

  private progress(message: string): void {
    this.onProgress?.(message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateRequirements(requirements: string): string | undefined {
  const trimmed = requirements.trim();
  if (!trimmed) {
    return 'Requirements must not be empty';
  }
  if (trimmed.length < 10) {
    return 'Requirements are too short — please provide more detail';
  }
  if (trimmed.length > 10_000) {
    return 'Requirements exceed the maximum length of 10,000 characters';
  }
  return undefined;
}

/**
 * Converts parsed GeneratedSpec objects into minimal SpecData entries suitable
 * for dependency validation. Fields absent from the frontmatter get safe defaults.
 */
function generatedSpecsToSpecData(specs: GeneratedSpec[]): SpecData[] {
  const results: SpecData[] = [];
  for (const spec of specs) {
    try {
      const { data } = parseFrontmatter(spec.content);
      results.push({
        spec_id: typeof data.spec_id === 'string' ? data.spec_id : spec.specId,
        title: typeof data.title === 'string' ? data.title : '',
        status:
          typeof data.status === 'string' ? (data.status as SpecData['status']) : 'draft',
        priority:
          typeof data.priority === 'string' ? (data.priority as SpecData['priority']) : 'medium',
        complexity:
          typeof data.complexity === 'string'
            ? (data.complexity as SpecData['complexity'])
            : 'medium',
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        relevant_files: Array.isArray(data.relevant_files) ? (data.relevant_files as string[]) : [],
        must_not_touch: Array.isArray(data.must_not_touch) ? (data.must_not_touch as string[]) : [],
        depends_on: Array.isArray(data.depends_on) ? (data.depends_on as string[]) : [],
        budget_max_tokens:
          typeof data.budget_max_tokens === 'number' ? data.budget_max_tokens : 100_000,
        agent_skills: typeof data.agent_skills === 'string' ? data.agent_skills : '',
        created:
          typeof data.created === 'string'
            ? data.created
            : new Date().toISOString().slice(0, 10),
      });
    } catch {
      // Skip specs whose frontmatter cannot be parsed — they will still be written
      // to disk and only dependency validation is affected.
    }
  }
  return results;
}

/**
 * Best-effort extraction of token usage numbers from Claude CLI output.
 * Claude CLI may append lines such as:
 *   Tokens: 1234 input, 567 output
 * or similar. Returns undefined fields when the pattern is absent.
 */
export function parseTokenUsage(output: string): TokenUsage {
  const inputMatch = /(\d+)\s*input\s*token/i.exec(output);
  const outputMatch = /(\d+)\s*output\s*token/i.exec(output);
  return {
    inputTokens: inputMatch ? parseInt(inputMatch[1], 10) : undefined,
    outputTokens: outputMatch ? parseInt(outputMatch[1], 10) : undefined,
  };
}

async function cleanupContextFile(workspaceRoot: string): Promise<void> {
  try {
    const absPath = path.join(workspaceRoot, CONTEXT_FILE);
    await execCommand(`rm -f "${absPath}"`);
  } catch {
    // Non-fatal: leave the file behind rather than surfacing a cleanup error.
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

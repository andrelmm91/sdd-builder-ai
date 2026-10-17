import { readWorkspaceFile } from '../utils/fileSystem';
import { CONVENTIONS_FILE } from '../utils/constants';
import type { SpecDocument } from '../specs/types';
import type { AIConfig } from '../config/aiConfigTypes';

const MAX_CONTEXT_BYTES = 100 * 1024;

const TRUNCATION_NOTICE = '\n\n[truncated by SDD]';

export type ContextOptions = {
  /** Provider-specific reference to the spec file, e.g. `@.specs/X.sdd.md`. */
  specFileRef: string;
  conventions?: string;
  /** Resolved skill file paths, listed for the agent to read. */
  skillPaths?: string[];
  feedback?: string;
  previousOutput?: string;
  /** Appended as `## Additional Instructions` (e.g. retry feedback). */
  extraInstructions?: string;
  aiConfig?: AIConfig;
};

/** Truncates to at most `maxBytes` UTF-8 bytes (notice included) without splitting a character. */
function truncateUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) {
    return text;
  }
  let end = maxBytes - Buffer.byteLength(TRUNCATION_NOTICE, 'utf8');
  // Back up while `end` points at a continuation byte (10xxxxxx), i.e. mid-character.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--;
  }
  return buf.subarray(0, end).toString('utf8') + TRUNCATION_NOTICE;
}

function buildRawSpec(spec: SpecDocument): string {
  const fm = spec.frontmatter;
  const relevantFiles = (fm.relevant_files ?? []).map((f) => `  - ${f}`).join('\n');
  const mustNotTouch = (fm.must_not_touch ?? []).map((f) => `  - ${f}`).join('\n');
  const dependsOn = (fm.depends_on ?? []).join(', ');
  const tags = (fm.tags ?? []).join(', ');

  const frontmatter = [
    '---',
    `spec_id: ${fm.spec_id}`,
    `title: ${fm.title}`,
    `status: ${fm.status}`,
    `priority: ${fm.priority}`,
    `complexity: ${fm.complexity}`,
    `tags: [${tags}]`,
    `relevant_files:`,
    relevantFiles,
    `must_not_touch:`,
    mustNotTouch,
    `depends_on: [${dependsOn}]`,
    `agent_skills: ${fm.agent_skills}`,
    `created: ${fm.created}`,
    '---',
  ].join('\n');

  const body = [
    spec.context ? `## Context\n\n${spec.context}` : '',
    spec.functionalRequirements ? `### Functional\n\n${spec.functionalRequirements}` : '',
    spec.nonFunctionalRequirements ? `### Non-Functional\n\n${spec.nonFunctionalRequirements}` : '',
    spec.automatedCriteria ? `### Automated\n\n${spec.automatedCriteria}` : '',
    spec.manualCriteria ? `### Manual\n\n${spec.manualCriteria}` : '',
    spec.constraints ? `## Constraints\n\n${spec.constraints}` : '',
    spec.examples ? `## Examples\n\n${spec.examples}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return `${frontmatter}\n\n${body}`;
}

/**
 * Builds the execution instructions document handed to the AI agent.
 *
 * Sections, in order: Instructions, Spec, Relevant Files, Conventions, Agent
 * Skills, Scope Constraints, Post-Execution Commands, Previous Feedback and
 * Additional Instructions.
 */
export async function buildExecutionPrompt(
  spec: SpecDocument,
  options: ContextOptions,
): Promise<string> {
  const sections: string[] = [];
  const fm = spec.frontmatter;

  // 1. Instructions (pre-prompt from AIConfig)
  if (options.aiConfig?.prePromptTemplate) {
    const specFile = options.specFileRef || `${fm.spec_id}.sdd.md`;
    const prompt = options.aiConfig.prePromptTemplate.replace(/\{spec_file\}/g, () => specFile);
    sections.push(`## Instructions\n\n${prompt}`);
  }

  // 2. Spec reference (inline the body only when no reference is available)
  if (options.specFileRef) {
    sections.push(`## Spec\n\nRead the spec file before starting: ${options.specFileRef}`);
  } else {
    sections.push(`## Spec\n\n${buildRawSpec(spec)}`);
  }

  // 3. Relevant Files (paths only; the agent reads them itself)
  const relevantFiles = fm.relevant_files ?? [];
  if (relevantFiles.length > 0) {
    const list = relevantFiles.map((f) => `- ${f}`).join('\n');
    sections.push(`## Relevant Files\n\nRead these files before making changes:\n\n${list}`);
  }

  // 4. Conventions
  const conventionsContent =
    options.conventions ?? (await readWorkspaceFile(CONVENTIONS_FILE));
  if (conventionsContent) {
    sections.push(`## Conventions\n\n${conventionsContent}`);
  }

  // 5. Agent Skills (paths)
  if (options.skillPaths && options.skillPaths.length > 0) {
    const list = options.skillPaths.map((p) => `- ${p}`).join('\n');
    sections.push(`## Agent Skills\n\nRead and follow these skill files:\n\n${list}`);
  }

  // 6. Scope Constraints
  const mustNotTouch = fm.must_not_touch ?? [];
  const scopeLines = [`Only modify files listed in relevant_files.`];
  if (mustNotTouch.length > 0) {
    scopeLines.push(`Do NOT modify: ${mustNotTouch.join(', ')}`);
  }
  scopeLines.push('SDD verifies scope after the run; changes outside the allowed files are flagged.');
  sections.push(`## Scope Constraints\n\n${scopeLines.join('\n')}`);

  // 7. Post-Execution Commands
  if (options.aiConfig) {
    const { commitCommand, commitCommandEnabled, prCommand, prCommandEnabled } = options.aiConfig;
    const enabledCommands: string[] = [];

    if (commitCommandEnabled && commitCommand) {
      const cmd = commitCommand.replace(/\{spec_id\}/g, fm.spec_id).replace(/\{title\}/g, fm.title);
      enabledCommands.push(`1. Commit changes: \`${cmd}\``);
    }

    if (prCommandEnabled && prCommand) {
      const cmd = prCommand.replace(/\{spec_id\}/g, fm.spec_id).replace(/\{title\}/g, fm.title);
      enabledCommands.push(`${enabledCommands.length + 1}. Create PR: \`${cmd}\``);
    }

    if (enabledCommands.length > 0) {
      sections.push(
        `## Post-Execution Commands\n\nAfter completing all implementation work, run the following commands:\n\n${enabledCommands.join('\n')}`,
      );
    }
  }

  // 8. Previous Feedback
  if (options.feedback) {
    const feedbackParts = [`### Feedback\n\n${options.feedback}`];
    if (options.previousOutput) {
      feedbackParts.push(`### Previous Output\n\n${options.previousOutput}`);
    }
    sections.push(`## Previous Feedback\n\n${feedbackParts.join('\n\n')}`);
  }

  // 9. Additional Instructions
  if (options.extraInstructions) {
    sections.push(`## Additional Instructions\n\n${options.extraInstructions}`);
  }

  return truncateUtf8(sections.join('\n\n---\n\n'), MAX_CONTEXT_BYTES);
}

/** @deprecated Use {@link buildExecutionPrompt}. Kept as an alias for one release. */
export async function assembleExecutionContext(
  spec: SpecDocument,
  options: Omit<ContextOptions, 'specFileRef'> & { specFileRef?: string },
): Promise<string> {
  return buildExecutionPrompt(spec, { ...options, specFileRef: options.specFileRef ?? '' });
}

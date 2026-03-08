import { readWorkspaceFile } from '../utils/fileSystem';
import { CONVENTIONS_FILE } from '../utils/constants';
import { loadSkills } from './skillsLoader';
import type { SpecDocument } from '../specs/types';
import type { AIConfig } from '../config/aiConfigTypes';

const MAX_CONTEXT_BYTES = 100 * 1024;

export type ContextOptions = {
  conventions?: string;
  skills?: string;
  feedback?: string;
  previousOutput?: string;
  aiConfig?: AIConfig;
};

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
    `budget_max_tokens: ${fm.budget_max_tokens}`,
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
 * Resolves skills content by checking tag-skill mappings from AIConfig first,
 * falling back to the spec's agent_skills field.
 */
async function resolveSkills(
  fm: SpecDocument['frontmatter'],
  aiConfig?: AIConfig,
): Promise<string | undefined> {
  // Check for tag-skill mappings from AIConfig
  if (aiConfig?.tagSkillMappings && aiConfig.tagSkillMappings.length > 0) {
    const specTags = new Set(fm.tags ?? []);
    const matchedSkills = aiConfig.tagSkillMappings
      .filter((m) => specTags.has(m.tag))
      .map((m) => m.skill);

    if (matchedSkills.length > 0) {
      const uniqueSkills = [...new Set(matchedSkills)];
      const skillSections: string[] = [];
      for (const skillName of uniqueSkills) {
        const content = await loadSkills(skillName);
        if (content) {
          skillSections.push(content);
        }
      }
      if (skillSections.length > 0) {
        const instruction = `Use the following skill(s) for this task: ${uniqueSkills.map((s) => `"${s}"`).join(', ')}.`;
        return `${instruction}\n\n${skillSections.join('\n\n---\n\n')}`;
      }
    }
  }

  // Fallback: use spec's agent_skills field
  if (fm.agent_skills) {
    const content = await loadSkills(fm.agent_skills);
    if (content) {
      return `Use the following skill for this task: "${fm.agent_skills}".\n\n${content}`;
    }
  }
  return undefined;
}

/**
 * Assembles a full execution context document for the Claude CLI agent.
 *
 * The returned string contains everything the agent needs to implement the
 * spec: the spec itself, relevant file contents, project conventions, agent
 * skills, scope constraints, and any prior feedback.
 */
export async function assembleExecutionContext(
  spec: SpecDocument,
  options: ContextOptions,
): Promise<string> {
  const sections: string[] = [];
  const fm = spec.frontmatter;

  // 0. Custom Pre-prompt (from AIConfig)
  if (options.aiConfig?.prePromptTemplate) {
    const specFileName = `${fm.spec_id}.sdd.md`;
    const prompt = options.aiConfig.prePromptTemplate.replace(/\{spec_file\}/g, specFileName);
    sections.push(`## Instructions\n\n${prompt}`);
  }

  // 1. Spec
  sections.push(`## Spec\n\n${buildRawSpec(spec)}`);

  // 2. Relevant Files
  const relevantFiles = fm.relevant_files ?? [];
  if (relevantFiles.length > 0) {
    const fileBlocks: string[] = [];
    for (const filePath of relevantFiles) {
      const content = await readWorkspaceFile(filePath);
      if (content === undefined) {
        fileBlocks.push(`### ${filePath}\n\nFile not found: ${filePath}`);
      } else {
        fileBlocks.push(`### ${filePath}\n\n\`\`\`\n${content}\n\`\`\``);
      }
    }
    sections.push(`## Relevant Files\n\n${fileBlocks.join('\n\n')}`);
  }

  // 3. Conventions
  const conventionsContent =
    options.conventions ?? (await readWorkspaceFile(CONVENTIONS_FILE));
  if (conventionsContent) {
    sections.push(`## Conventions\n\n${conventionsContent}`);
  }

  // 4. Agent Skills (tag-skill mappings from AIConfig override spec's agent_skills)
  const skillsContent = options.skills ?? await resolveSkills(fm, options.aiConfig);
  if (skillsContent) {
    sections.push(`## Agent Skills\n\n${skillsContent}`);
  }

  // 5. Scope Constraints
  const mustNotTouch = fm.must_not_touch ?? [];
  const scopeLines = [`Only modify files listed in relevant_files.`];
  if (mustNotTouch.length > 0) {
    scopeLines.push(`Do NOT modify: ${mustNotTouch.join(', ')}`);
  }
  sections.push(`## Scope Constraints\n\n${scopeLines.join('\n')}`);

  // 6. Previous Feedback
  if (options.feedback) {
    const feedbackParts = [`### Feedback\n\n${options.feedback}`];
    if (options.previousOutput) {
      feedbackParts.push(`### Previous Output\n\n${options.previousOutput}`);
    }
    sections.push(`## Previous Feedback\n\n${feedbackParts.join('\n\n')}`);
  }

  const document = sections.join('\n\n---\n\n');

  if (Buffer.byteLength(document, 'utf8') > MAX_CONTEXT_BYTES) {
    return Buffer.from(document, 'utf8').slice(0, MAX_CONTEXT_BYTES).toString('utf8');
  }

  return document;
}

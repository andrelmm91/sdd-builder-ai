import type { SpecTemplate } from './types';

export interface TemplateOptions {
  template: SpecTemplate;
  specId: string;
  title?: string;
  tags?: string[];
  created?: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function featureBody(): string {
  return `## Context

<!-- Describe the feature being added and why it is needed. Link to any relevant specs or discussions. -->

## Requirements

### Functional
- [ ] <!-- Primary behaviour the code must implement -->
- [ ] <!-- Additional functional requirement -->

### Non-Functional
- [ ] <!-- Performance, accessibility, or security requirements -->

## Acceptance Criteria

### Automated
- [ ] Unit tests pass for all public exports
- [ ] TypeScript compilation passes

### Manual
- [ ] Feature behaves as described in Context when exercised manually

## Constraints
- Adhere to project conventions in \`.sdd/conventions.md\`
- Maximum 3 files to create/edit (excluding test files)

## Examples

\`\`\`ts
// Example usage of the new feature
\`\`\`
`;
}

function bugfixBody(): string {
  return `## Context

<!-- Describe the bug: what is observed vs. what is expected.
     Include reproduction steps so the agent can verify the fix. -->

**Reproduction steps:**
1. <!-- Step 1 -->
2. <!-- Step 2 -->

**Expected behaviour:** <!-- What should happen -->
**Actual behaviour:** <!-- What currently happens -->

## Requirements

### Functional
- [ ] The bug is fixed and reproduction steps no longer trigger the issue
- [ ] No regressions introduced in related code paths

### Non-Functional
- [ ] Fix does not degrade performance or security

## Acceptance Criteria

### Automated
- [ ] Regression test added that would have caught this bug
- [ ] All existing tests still pass
- [ ] TypeScript compilation passes

### Manual
- [ ] Reproduction steps from Context no longer reproduce the bug

## Constraints
- Fix must be surgical — minimal diff, no opportunistic refactors
- Do not modify unrelated files

## Examples

\`\`\`ts
// Before fix (bug trigger)
// After fix (correct behaviour)
\`\`\`
`;
}

function refactorBody(): string {
  return `## Context

<!-- Describe what is being refactored and why. Focus on the architectural problem being solved,
     not implementation details. Provide evidence that behaviour is preserved. -->

## Requirements

### Functional
- [ ] All existing public contracts (types, exports, behaviours) are preserved
- [ ] <!-- Specific refactor goal, e.g. "extract X into its own module" -->

### Non-Functional
- [ ] No performance regression
- [ ] Code is easier to understand and extend after the change

## Acceptance Criteria

### Automated
- [ ] All existing tests still pass without modification (behaviour is unchanged)
- [ ] TypeScript compilation passes

### Manual
- [ ] Reviewer agrees the code is cleaner / better structured after the change

## Constraints
- Do NOT change public API signatures unless explicitly listed in Requirements
- List all files that must remain untouched in \`must_not_touch\`
- Refactor only the scope described — no additional features

## Examples

\`\`\`ts
// Before refactor (sketch)
// After refactor (sketch)
\`\`\`
`;
}

const TEMPLATE_BODY: Record<SpecTemplate, () => string> = {
  feature: featureBody,
  bugfix: bugfixBody,
  refactor: refactorBody,
};

const TEMPLATE_TAGS: Record<SpecTemplate, string[]> = {
  feature: ['feature'],
  bugfix: ['bugfix'],
  refactor: ['refactor'],
};

export function generateSpecFromTemplate(options: TemplateOptions): string {
  const { template, specId, title, tags, created } = options;

  const resolvedTitle = title ?? `<!-- Spec title for ${specId} -->`;
  const resolvedTags = tags ?? TEMPLATE_TAGS[template];
  const resolvedCreated = created ?? todayIso();

  const frontmatter = [
    '---',
    `spec_id: ${specId}`,
    `title: ${resolvedTitle}`,
    `status: draft`,
    `priority: medium`,
    `complexity: medium`,
    `tags: [${resolvedTags.join(', ')}]`,
    `relevant_files: []`,
    `must_not_touch: []`,
    `depends_on: []`,
    `budget_max_tokens: 100000`,
    `agent_skills: backend-dev`,
    `created: ${resolvedCreated}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + TEMPLATE_BODY[template]();
}

export function getTemplateDescription(template: SpecTemplate): string {
  switch (template) {
    case 'feature':
      return 'Feature — add new functionality with functional requirements and automated tests';
    case 'bugfix':
      return 'Bug Fix — document reproduction steps and add a regression test';
    case 'refactor':
      return 'Refactor — restructure code while preserving all existing behaviour';
  }
}

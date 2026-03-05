export type SpecStatus = 'draft' | 'ready' | 'in_progress' | 'review' | 'done';

export type SpecPriority = 'high' | 'medium' | 'low';

export type SpecComplexity = 'low' | 'medium' | 'high';

export type SpecTemplate = 'feature' | 'bugfix' | 'refactor';

export interface SpecData {
  spec_id: string;
  title: string;
  status: SpecStatus;
  priority: SpecPriority;
  complexity: SpecComplexity;
  tags: string[];
  relevant_files: string[];
  must_not_touch: string[];
  depends_on: string[];
  budget_max_tokens: number;
  agent_skills: string;
  created: string;
}

export interface SpecDocument {
  frontmatter: SpecData;
  context: string;
  functionalRequirements: string;
  nonFunctionalRequirements: string;
  automatedCriteria: string;
  manualCriteria: string;
  constraints: string;
  examples: string;
}

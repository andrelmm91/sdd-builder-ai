export type FeatureStatus = 'Feature Backlog' | 'Idealization In Review' | 'SDD Created';

export type RequirementType = 'new_feature' | 'bug_fix' | 'technical_debt';

export interface FeatureData {
  status: FeatureStatus;
  date: string;
  title?: string;
  requirementType?: RequirementType;
}

export interface FeatureCard {
  name: string;
  title: string;
  status: FeatureStatus;
  filePath: string;
  folderPath: string;
  hasIdealization: boolean;
  requirementType?: RequirementType;
}

export interface FeatureFormData {
  name: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
  requirementType: RequirementType;
}

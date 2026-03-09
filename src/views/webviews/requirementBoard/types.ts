export type FeatureStatus = 'Feature Backlog' | 'Idealization In Review' | 'SDD Created';

export interface FeatureData {
  status: FeatureStatus;
  date: string;
  title?: string;
}

export interface FeatureCard {
  name: string;
  title: string;
  status: FeatureStatus;
  filePath: string;
  folderPath: string;
  hasIdealization: boolean;
}

export interface FeatureFormData {
  name: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
}

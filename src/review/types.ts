export type ReviewDecision = 'approve' | 'request_changes' | 'reject';

export interface ReviewRecord {
  specId: string;
  reviewNumber: number;
  timestamp: string;
  decision: ReviewDecision;
  feedback?: string;
  reviewer: string;
}

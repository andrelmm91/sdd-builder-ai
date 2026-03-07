import { readWorkspaceFile, writeWorkspaceFile, listFiles } from '../utils/fileSystem';
import { REVIEWS_FOLDER } from '../utils/constants';
import type { ReviewRecord } from './types';

export async function getReviewNumber(specId: string): Promise<number> {
  const pattern = `${REVIEWS_FOLDER}/${specId}/review-*.md`;
  const files = await listFiles(pattern);
  if (files.length === 0) return 1;

  const nums = files
    .map((f) => {
      const m = /review-(\d+)\.md$/.exec(f);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);

  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

export async function saveFeedback(specId: string, review: ReviewRecord): Promise<string> {
  const num = await getReviewNumber(specId);
  const paddedNum = String(num).padStart(3, '0');
  const filePath = `${REVIEWS_FOLDER}/${specId}/review-${paddedNum}.md`;

  const lines = [
    `# Review ${paddedNum} — ${specId}`,
    '',
    `**Decision:** ${review.decision}`,
    `**Reviewer:** ${review.reviewer}`,
    `**Timestamp:** ${review.timestamp}`,
    '',
  ];

  if (review.feedback) {
    lines.push('## Feedback', '', review.feedback);
  } else {
    lines.push('_No feedback provided._');
  }

  await writeWorkspaceFile(filePath, lines.join('\n'));
  return filePath;
}

export async function loadLatestFeedback(specId: string): Promise<string | undefined> {
  const pattern = `${REVIEWS_FOLDER}/${specId}/review-*.md`;
  const files = await listFiles(pattern);
  if (files.length === 0) return undefined;

  const sorted = files
    .filter((f) => /review-\d+\.md$/.test(f))
    .sort();

  return readWorkspaceFile(sorted[sorted.length - 1]);
}

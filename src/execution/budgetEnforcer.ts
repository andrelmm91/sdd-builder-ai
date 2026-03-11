import type { SpecComplexity } from '../specs/types';

export interface BudgetValidation {
  valid: boolean;
  warning?: string;
}

const BUDGET_MIN = 10_000;
const BUDGET_MAX = 500_000;
const BUDGET_WARN_THRESHOLD = 200_000;

const BUDGET_BY_COMPLEXITY: Record<SpecComplexity, number> = {
  low: 50_000,
  medium: 100_000,
  high: 150_000,
};

export function validateBudget(budget: number): BudgetValidation {
  if (budget < BUDGET_MIN) {
    return { valid: false, warning: `Budget ${budget} is below minimum of ${BUDGET_MIN}` };
  }
  if (budget > BUDGET_MAX) {
    return { valid: false, warning: `Budget ${budget} exceeds maximum of ${BUDGET_MAX}` };
  }
  if (budget > BUDGET_WARN_THRESHOLD) {
    return { valid: true, warning: `Budget ${budget} is above the recommended threshold of ${BUDGET_WARN_THRESHOLD}` };
  }
  return { valid: true };
}

export function checkBudgetExceeded(budget: number, tokensUsed: number): boolean {
  return tokensUsed > budget;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${parseFloat(value.toPrecision(3))}M`;
  }
  if (tokens >= 1_000) {
    const value = tokens / 1_000;
    return `${parseFloat(value.toPrecision(3))}K`;
  }
  return String(tokens);
}

export function getBudgetForComplexity(complexity: SpecComplexity): number {
  return BUDGET_BY_COMPLEXITY[complexity];
}

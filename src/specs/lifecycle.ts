import { SpecData, SpecStatus } from './types';

export type TransitionResult =
  | { success: true; newStatus: SpecStatus }
  | { success: false; error: string };

const VALID_TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
  draft: ['ready'],
  ready: ['in_progress'],
  in_progress: ['review'],
  review: ['done', 'ready', 'draft'],
  done: ['draft'],
};

export function canTransition(from: SpecStatus, to: SpecStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function getValidTransitions(status: SpecStatus): SpecStatus[] {
  return VALID_TRANSITIONS[status];
}

export function transitionSpec(spec: SpecData, to: SpecStatus): TransitionResult {
  if (canTransition(spec.status, to)) {
    return { success: true, newStatus: to };
  }
  return {
    success: false,
    error: `Invalid transition: '${spec.status}' → '${to}'. Valid transitions from '${spec.status}' are: [${VALID_TRANSITIONS[spec.status].join(', ')}]`,
  };
}

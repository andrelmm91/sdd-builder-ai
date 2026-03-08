import type { SpecStatus } from '../specs/types';

export const SPEC_FILE_EXTENSION = '.sdd.md';
export const SPECS_FOLDER = '.specs';
export const SDD_FOLDER = '.sdd';
export const CONFIG_FILE = '.sdd/config.json';
export const CONVENTIONS_FILE = '.sdd/conventions.md';
export const EXECUTIONS_FOLDER = '.sdd/executions';
export const REVIEWS_FOLDER = '.sdd/reviews';
export const SKILLS_FOLDER = '.sdd/skills';
export const AI_CONFIG_FILE = '.sdd/ai-config.json';

export const DEFAULT_BUDGET = 100000;
export const DEFAULT_PREFIX = 'SPEC';

export const STATUS_ORDER: SpecStatus[] = [
  'draft',
  'ready',
  'in_progress',
  'review',
  'done',
];

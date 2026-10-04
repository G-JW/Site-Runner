import type { CleanupPolicy } from './types.js';

export const defaultCleanupPolicy: CleanupPolicy = { automatic: false, historyDays: 90, backupDays: 30 };

export function validateCleanupPolicy(value: unknown): CleanupPolicy {
  const policy = value as CleanupPolicy;
  if (!policy || typeof policy.automatic !== 'boolean') throw new Error('Invalid cleanup policy');
  for (const key of ['historyDays', 'backupDays'] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1 || policy[key] > 3650) throw new Error('Retention must be between 1 and 3650 days');
  }
  return { automatic: policy.automatic, historyDays: policy.historyDays, backupDays: policy.backupDays };
}

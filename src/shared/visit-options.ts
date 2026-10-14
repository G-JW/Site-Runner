import type { VisitOptions } from './types.js';
export const legacyVisitOptions: VisitOptions = { stayMs: 0, detectChallenges: false };
export const defaultVisitOptions: VisitOptions = { stayMs: 5000, detectChallenges: true };
export function validateVisitOptions(value: VisitOptions): VisitOptions {
  if (!value || !Number.isInteger(value.stayMs) || value.stayMs < 0 || value.stayMs > 60000 || typeof value.detectChallenges !== 'boolean') throw new Error('Invalid visit options');
  // Older configurations may contain check/value. Ignore them on load, import and save.
  return { stayMs: value.stayMs, detectChallenges: value.detectChallenges };
}

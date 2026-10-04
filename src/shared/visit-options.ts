import type { VisitOptions } from './types.js';
export const legacyVisitOptions: VisitOptions = { stayMs: 0, detectChallenges: false, check: 'none', value: '' };
export const defaultVisitOptions: VisitOptions = { stayMs: 5000, detectChallenges: true, check: 'none', value: '' };
export function validateVisitOptions(value: VisitOptions): VisitOptions {
  if (!value || !Number.isInteger(value.stayMs) || value.stayMs < 0 || value.stayMs > 60000 || typeof value.detectChallenges !== 'boolean' || !['none', 'selector', 'text'].includes(value.check) || typeof value.value !== 'string' || (value.check !== 'none' && !value.value.trim())) throw new Error('Invalid visit check options');
  return { stayMs: value.stayMs, detectChallenges: value.detectChallenges, check: value.check, value: value.value.trim() };
}

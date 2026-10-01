import { describe, expect, it } from 'vitest';
import { validateCron } from '../src/main/scheduler/scheduler-service.js';

describe('cron validation', () => {
  it('accepts valid schedules and rejects malformed expressions', () => {
    expect(validateCron('0 9 * * *')).toBe(true);
    expect(validateCron('not-a-cron')).toBe(false);
  });
});

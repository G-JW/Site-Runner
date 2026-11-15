/** Persisted execution limit. Missing values in older configurations use this default. */
export const defaultConcurrency = 3;
export const maxConcurrency = 10;

export function validateConcurrency(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maxConcurrency
  )
    throw new Error(
      `Concurrency must be an integer between 1 and ${maxConcurrency}`,
    );
  return value as number;
}

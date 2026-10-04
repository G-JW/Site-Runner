import { existsSync, lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createLogger } from '../src/main/logging.js';

it('rotates during use, retains only three archives and keeps private valid JSON logs', () => {
  const root = mkdtempSync('/private/tmp/site-runner-logs-');
  const logging = createLogger(root, { maxBytes: 256, archives: 3 });
  for (let index = 0; index < 30; index++) logging.logger.info(`entry ${index} ${'x'.repeat(90)}`);
  logging.close();
  for (const suffix of ['', '.1', '.2', '.3']) {
    const file = path.join(root, 'site-runner.log' + suffix);
    expect(lstatSync(file).size).toBeLessThanOrEqual(256); expect(lstatSync(file).mode & 0o777).toBe(0o600);
    for (const line of readFileSync(file, 'utf8').trim().split('\n')) expect(() => JSON.parse(line)).not.toThrow();
  }
  expect(existsSync(path.join(root, 'site-runner.log.4'))).toBe(false);
  expect(readFileSync(path.join(root, 'site-runner.log'), 'utf8')).toContain('entry 29');
});

it('rotates an existing oversized log on first write and bounds a single oversized message', () => {
  const root = mkdtempSync('/private/tmp/site-runner-logs-'), file = path.join(root, 'site-runner.log');
  writeFileSync(file, 'old'.repeat(200));
  const logging = createLogger(root, { maxBytes: 256, archives: 1 }); logging.logger.info('x'.repeat(1000)); logging.close();
  expect(readFileSync(file + '.1', 'utf8')).toBe('old'.repeat(200));
  expect(lstatSync(file).size).toBeLessThanOrEqual(256); expect(JSON.parse(readFileSync(file, 'utf8')).msg).toContain('Oversized');
});

it('falls back to stderr for unusable log paths without following a symlink or breaking callers', () => {
  const root = mkdtempSync('/private/tmp/site-runner-logs-'), external = path.join(root, 'external.txt'); writeFileSync(external, 'preserve'); symlinkSync(external, path.join(root, 'site-runner.log'));
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const logging = createLogger(root); expect(() => logging.logger.info('result')).not.toThrow(); logging.close();
    expect(stderr).toHaveBeenCalled(); expect(readFileSync(external, 'utf8')).toBe('preserve');
    const failed = createLogger(external); failed.logger.info('fallback'); failed.close(); expect(readFileSync(external, 'utf8')).toBe('preserve');
  } finally { stderr.mockRestore(); }
});

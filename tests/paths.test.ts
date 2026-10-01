import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAppPaths } from '../src/main/paths.js';

describe('buildAppPaths', () => {
  it('keeps all persistent files below the platform user-data directory', () => {
    const userData = path.join(path.parse(process.cwd()).root, 'user-data', 'Site Runner');

    expect(buildAppPaths(userData)).toEqual({
      userData,
      database: path.join(userData, 'site-runner.sqlite3'),
      profiles: path.join(userData, 'profiles'),
      screenshots: path.join(userData, 'screenshots'),
      logs: path.join(userData, 'logs'),
    });
  });
});

import { app } from 'electron';
import path from 'node:path';

export interface AppPaths {
  userData: string;
  database: string;
  profiles: string;
  screenshots: string;
  logs: string;
}

export function buildAppPaths(userData: string): AppPaths {
  return {
    userData,
    database: path.join(userData, 'site-runner.sqlite3'),
    profiles: path.join(userData, 'profiles'),
    screenshots: path.join(userData, 'screenshots'),
    logs: path.join(userData, 'logs'),
  };
}

export function getAppPaths(): AppPaths {
  return buildAppPaths(app.getPath('userData'));
}

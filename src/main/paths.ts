import { app } from 'electron';
import path from 'node:path';

export interface AppPaths {
  userData: string;
  database: string;
  profiles: string;
  screenshots: string;
  logs: string;
}

export function getAppPaths(): AppPaths {
  const userData = app.getPath('userData');
  return {
    userData,
    database: path.join(userData, 'site-runner.sqlite3'),
    profiles: path.join(userData, 'profiles'),
    screenshots: path.join(userData, 'screenshots'),
    logs: path.join(userData, 'logs'),
  };
}

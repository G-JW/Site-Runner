import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';

export function createLogger(logDirectory: string) {
  mkdirSync(logDirectory, { recursive: true });
  return pino({ name: 'site-runner', level: process.env.LOG_LEVEL ?? 'info' },
    pino.destination({ dest: path.join(logDirectory, 'site-runner.log'), sync: false, mkdir: true }));
}

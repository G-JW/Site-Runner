import { tmpdir as systemTemporaryDirectory } from "node:os";
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { CleanupService } from '../src/main/services/cleanup-service.js';
import { exportConfiguration, importConfiguration, parseConfiguration } from '../src/main/configuration.js';

const removal = vi.hoisted(() => ({ fail: '' }));
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, unlinkSync: (file: string) => {
    if (file === removal.fail) throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
    return original.unlinkSync(file);
  } };
});

let root: string, database: AppDatabase, data: DataService, cleanup: CleanupService, siteId: string, clock: number;
const old = Date.parse('2025-01-01T00:00:00Z');
function file(relative: string, modified = old): string {
  const target = path.join(root, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, 'test'); utimesSync(target, modified / 1000, modified / 1000); return target;
}
function screenshot() { return `screenshots/2025-01/${randomUUID()}-2025-01-01T00-00-00-000Z.png`; }
function run(id: string, finishedAt: string, screenshotPath: string | null = null) {
  data.saveRun({ id, siteId, siteName: 'Site', startedAt: finishedAt, finishedAt, status: 'failed', message: null, error: 'test', lastUrl: null, screenshotPath, trigger: 'manual' }, [{ siteId, level: 'info', message: 'log', timestamp: finishedAt }]);
}
beforeEach(() => {
  root = mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-cleanup-')); database = new AppDatabase(path.join(root, 'test.sqlite3')); data = new DataService(database.connection);
  siteId = data.saveSite({ name: 'Site', url: 'https://example.com', enabled: true, script: null, browserProfileId: data.createProfile('Default').id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } }).id;
  clock = Date.parse('2026-10-04T12:00:00Z'); cleanup = new CleanupService(data, root, () => clock);
});
afterEach(() => { cleanup.stop(); database.close(); vi.useRealTimers(); removal.fail = ''; });

it('previews without deleting and removes only expired managed data while preserving current references and newest backup', () => {
  const expired = file(screenshot()), retained = file(screenshot()), orphan = file(screenshot());
  run('old', new Date(old).toISOString(), expired); run('new', new Date(clock).toISOString(), retained); run('unknown-time', '', retained);
  data.saveReceipt({ channelName: 'Local', title: 'Old', success: true, error: null }); database.connection.prepare('UPDATE notification_receipts SET created_at = ?').run(new Date(old).toISOString());
  const backup = file('backups/before-v2-100.sqlite3'), newest = file('backups/before-v4-200.sqlite3');
  const protectedFiles = [file('screenshots/2025-01/manual.png'), file('profiles/default/session'), file('backups/custom.sqlite3')];
  const preview = cleanup.preview(); expect(preview).toMatchObject({ runs: 1, receipts: 1, screenshots: 2, backups: 1, bytes: 12 }); expect(existsSync(expired)).toBe(true); expect(data.runDetail('old').logs).toHaveLength(1);
  expect(cleanup.execute(preview.id)).toMatchObject({ runs: 1, receipts: 1, screenshots: 2, backups: 1, bytes: 12, errors: [] });
  for (const target of [expired, orphan, backup]) expect(existsSync(target)).toBe(false);
  for (const target of [retained, newest, ...protectedFiles]) expect(existsSync(target)).toBe(true);
  expect(() => data.getRun('old')).toThrow(); expect(database.connection.prepare('SELECT count(*) AS count FROM run_logs WHERE run_id = ?').get('old')).toMatchObject({ count: 0 });
  expect(data.listSites()).toHaveLength(1); expect(data.listProfiles()).toHaveLength(1); expect(data.getCleanupStatus()?.report.runs).toBe(1);
  expect(() => cleanup.execute(preview.id)).toThrow(/expired/);
});

it('ignores directory and file symlinks and never deletes a stored external screenshot path', () => {
  const outside = mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-outside-')), external = path.join(outside, 'private.png'); writeFileSync(external, 'private');
  mkdirSync(path.join(root, 'screenshots'), { recursive: true }); symlinkSync(outside, path.join(root, 'screenshots', '2025-01'));
  mkdirSync(path.join(root, 'screenshots', '2025-02')); symlinkSync(external, path.join(root, screenshot().replace('2025-01/', '2025-02/')));
  run('old', new Date(old).toISOString(), external);
  const preview = cleanup.preview(); expect(preview.screenshots).toBe(0); cleanup.execute(preview.id); expect(existsSync(external)).toBe(true);
});

it('rechecks changed files, new retained references, policy changes and the latest backup before execution', () => {
  const changed = file(screenshot()), referenced = file(screenshot()), oldBackup = file('backups/before-v2-100.sqlite3'), latest = file('backups/before-v4-200.sqlite3');
  const preview = cleanup.preview(); writeFileSync(changed, 'changed'); run('new', new Date(clock).toISOString(), referenced);
  // The previewed old backup is now the only remaining backup.
  unlinkSync(latest);
  expect(cleanup.execute(preview.id)).toMatchObject({ screenshots: 0, backups: 0, runs: 0 });
  expect(existsSync(changed) && existsSync(referenced) && existsSync(oldBackup)).toBe(true);
  run('older', '2026-06-01T00:00:00Z'); const next = cleanup.preview(); data.updateSettings({ cleanup: { automatic: false, historyDays: 1000, backupDays: 1000 } });
  expect(cleanup.execute(next.id).runs).toBe(0); expect(data.getRun('older')).toBeTruthy();
});

it('expires previews and does not include newly created records or files in an approved preview', () => {
  run('old', new Date(old).toISOString()); const expired = cleanup.preview(); clock += 11 * 60000; expect(() => cleanup.execute(expired.id)).toThrow(/expired/);
  const preview = cleanup.preview(); run('later', new Date(old).toISOString()); const later = file(screenshot());
  expect(cleanup.execute(preview.id)).toMatchObject({ runs: 1, screenshots: 0 }); expect(data.getRun('later')).toBeTruthy(); expect(existsSync(later)).toBe(true);
});

it('defaults automatic cleanup off and runs every 24 hours only when opted in', () => {
  vi.useFakeTimers(); run('old', new Date(old).toISOString()); cleanup.start(); expect(data.getRun('old')).toBeTruthy();
  data.updateSettings({ cleanup: { automatic: true, historyDays: 90, backupDays: 30 } }); vi.advanceTimersByTime(86400000); expect(() => data.getRun('old')).toThrow();
  run('second', new Date(old).toISOString()); data.updateSettings({ cleanup: { automatic: false, historyDays: 90, backupDays: 30 } }); vi.advanceTimersByTime(86400000); expect(data.getRun('second')).toBeTruthy();
});

it('validates retention settings and keeps legacy backups compatible without importing automatic deletion', () => {
  for (const days of [0, -1, 1.5, 3651]) expect(() => data.updateSettings({ cleanup: { automatic: false, historyDays: days, backupDays: 30 } })).toThrow();
  const backup = exportConfiguration(data); const legacy = JSON.parse(JSON.stringify(backup)); delete legacy.settings.cleanup;
  expect(parseConfiguration(legacy).settings.cleanup.automatic).toBe(false);
  backup.settings.cleanup.automatic = true; importConfiguration(data, backup, true); expect(data.getSettings().cleanup.automatic).toBe(false);
});

it('records individual file removal failures and retries orphan screenshots without blocking other cleanup', () => {
  const failed = file(screenshot()), other = file(screenshot()); run('old', new Date(old).toISOString(), failed);
  removal.fail = failed;
  const first = cleanup.execute(cleanup.preview().id);
  expect(first).toMatchObject({ runs: 1, screenshots: 1, bytes: 4 }); expect(first.errors).toHaveLength(1);
  expect(first.errors[0]).toContain('Access denied'); expect(existsSync(failed)).toBe(true); expect(existsSync(other)).toBe(false);
  expect(data.getCleanupStatus()?.report.errors).toHaveLength(1);
  removal.fail = '';
  expect(cleanup.execute(cleanup.preview().id)).toMatchObject({ runs: 0, screenshots: 1, errors: [] }); expect(existsSync(failed)).toBe(false);
});

it('rolls back history deletion without removing files when the database rejects cleanup', () => {
  const image = file(screenshot()); run('old', new Date(old).toISOString(), image);
  database.connection.exec("CREATE TRIGGER reject_cleanup BEFORE DELETE ON run_records BEGIN SELECT RAISE(ABORT, 'Database refused'); END;");
  expect(() => cleanup.execute(cleanup.preview().id)).toThrow('Database refused');
  expect(data.runDetail('old').logs).toHaveLength(1); expect(existsSync(image)).toBe(true);
});

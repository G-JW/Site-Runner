import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';

function filename() { return path.join(mkdtempSync('/private/tmp/site-runner-folders-'), 'test.sqlite3'); }

describe('site folders', () => {
  it('upgrades an existing version 1 database without losing sites, runs or templates', () => {
    const file = filename();
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE browser_profiles(id TEXT PRIMARY KEY, name TEXT, created_at TEXT);
      CREATE TABLE sites(id TEXT PRIMARY KEY, name TEXT, url TEXT, enabled INTEGER, script TEXT,
        browser_profile_id TEXT, timeout_ms INTEGER, schedule_enabled INTEGER, schedule_cron TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE run_records(id TEXT PRIMARY KEY, site_id TEXT, started_at TEXT, finished_at TEXT, status TEXT,
        message TEXT, error TEXT, last_url TEXT, screenshot_path TEXT, trigger TEXT);
      CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO browser_profiles VALUES('profile', 'Existing', 'date');
      INSERT INTO sites VALUES('site', 'Existing site', 'https://example.com', 1, 'script', 'profile', 30000, 1, '0 9 * * *', 'date', 'date');
      INSERT INTO run_records VALUES('run', 'site', 'date', 'date', 'success', 'done', NULL, NULL, NULL, 'manual');
      PRAGMA user_version = 1;
    `);
    legacy.prepare('INSERT INTO settings VALUES (?, ?)').run('scriptTemplates', '[]');
    legacy.close();
    const database = new AppDatabase(file);
    try {
      const data = new DataService(database.connection);
      expect(data.getSite('site')).toMatchObject({ folderId: null, script: 'script', schedule: { enabled: true }, lastRun: { id: 'run' } });
      expect(data.listTemplates()).toEqual([]);
      expect(database.connection.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 });
      const folder = data.saveFolder({ name: 'Forums' });
      data.moveSites(['site'], folder.id);
      expect(data.getSite('site').folderId).toBe(folder.id);
    } finally { database.close(); }
    const reopened = new AppDatabase(file);
    try { expect(new DataService(reopened.connection).getSite('site').folderId).not.toBeNull(); }
    finally { reopened.close(); }
  });

  it('moves sites atomically and deletes only the folder, preserving schedules and history', () => {
    const database = new AppDatabase(filename());
    try {
      const data = new DataService(database.connection);
      const profile = data.createProfile('Default');
      const create = (name: string) => data.saveSite({ name, url: 'https://example.com', enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: true, cron: '0 9 * * *' } });
      const a = create('A'), b = create('B');
      const folder = data.saveFolder({ name: 'Forums' });
      expect(() => data.saveFolder({ name: 'forums' })).toThrow('already exists');
      data.saveFolder({ id: folder.id, name: 'Daily' });
      expect(() => data.moveSites([a.id, 'missing'], folder.id)).toThrow();
      expect(data.getSite(a.id).folderId).toBeNull();
      database.connection.exec("CREATE TRIGGER fail_move BEFORE UPDATE OF folder_id ON sites WHEN OLD.name = 'B' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
      expect(() => data.moveSites([a.id, b.id], folder.id)).toThrow('test failure');
      expect(data.getSite(a.id).folderId).toBeNull();
      database.connection.exec('DROP TRIGGER fail_move');
      data.moveSites([a.id, b.id], folder.id);
      expect(data.getSite(b.id).folderId).toBe(folder.id);
      data.saveSite({ ...data.getSite(a.id), name: 'Updated' });
      expect(data.getSite(a.id).folderId).toBe(folder.id);
      data.removeFolder(folder.id);
      expect(data.listSites()).toHaveLength(2);
      expect(data.getSite(a.id)).toMatchObject({ folderId: null, enabled: true, schedule: { enabled: true } });
      expect(() => data.saveSite({ ...a, folderId: 'missing' })).toThrow('Folder not found');
    } finally { database.close(); }
  });
});

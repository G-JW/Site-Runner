import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { exportConfiguration, importConfiguration, parseConfiguration } from '../src/main/configuration.js';

it('exports portable configuration and imports additively with paused schedules and intact references', () => {
  const root = mkdtempSync('/private/tmp/site-runner-configuration-'); const database = new AppDatabase(path.join(root, 'test.sqlite3'));
  try {
    const data = new DataService(database.connection), profile = data.createProfile('Default');
    const folder = data.saveFolder({ name: 'Forums', schedule: { enabled: true, cron: '0 9 * * *' } });
    for (const name of ['Good', 'Fail']) data.saveSite({ name, url: 'https://example.com', script: null, enabled: true, browserProfileId: profile.id, folderId: folder.id, timeoutMs: 30000, schedule: { enabled: true, cron: '0 9 * * *' } });
    data.saveChannel({ name: 'Private', providerType: 'ntfy', enabled: true, eventPolicy: 'all', config: { token: 'private-secret' } });
    const backup = exportConfiguration(data), serialized = JSON.stringify(backup);
    expect(serialized).not.toContain(profile.id); expect(serialized).not.toContain(folder.id); expect(serialized).not.toContain('private-secret');
    expect(importConfiguration(data, JSON.parse(serialized), false)).toEqual({ sites: 2, templates: 6 });
    const imported = data.listSites().find((site) => site.name === 'Good (2)')!;
    expect(imported).toMatchObject({ enabled: false, schedule: { enabled: false } });
    expect(imported.folderId).not.toBe(folder.id); expect(imported.browserProfileId).not.toBe(profile.id);
    expect(data.listFolders().find((item) => item.id === imported.folderId)?.schedule.enabled).toBe(false);
    const snapshot = { sites: data.listSites(), profiles: data.listProfiles(), folders: data.listFolders(), templates: data.listTemplates(), settings: data.getSettings() };
    database.connection.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON sites WHEN NEW.name LIKE 'Fail%' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => importConfiguration(data, backup, true)).toThrow('test failure');
    expect({ sites: data.listSites(), profiles: data.listProfiles(), folders: data.listFolders(), templates: data.listTemplates(), settings: data.getSettings() }).toEqual(snapshot);
    expect(() => parseConfiguration({ ...backup, sites: [{ ...backup.sites[0], profileKey: 'missing' }] })).toThrow();
    expect(() => parseConfiguration({ ...backup, settings: { ...backup.settings, defaultTimeoutMs: 0 } })).toThrow();
  } finally { database.close(); }
});

it('takes a consistent private snapshot before upgrading an existing database', () => {
  const root = mkdtempSync('/private/tmp/site-runner-upgrade-backup-'), file = path.join(root, 'test.sqlite3');
  const database = new AppDatabase(file);
  new DataService(database.connection).createProfile('Preserved');
  // Simulate an older schema marker; remove only the v5 tables to replay that migration.
  database.connection.exec('DROP TABLE run_logs; DROP TABLE notification_receipts; ALTER TABLE sites DROP COLUMN schedule_mode; ALTER TABLE run_records DROP COLUMN outcome; PRAGMA user_version = 4;'); database.close();
  const upgraded = new AppDatabase(file); upgraded.close();
  const files = readdirSync(path.join(root, 'backups')); expect(files).toHaveLength(1);
  expect(statSync(path.join(root, 'backups', files[0]!)).mode & 0o777).toBe(0o600);
});

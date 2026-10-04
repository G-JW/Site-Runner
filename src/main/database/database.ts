import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class AppDatabase {
  readonly connection: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.connection = new DatabaseSync(databasePath);
    this.connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close(): void { this.connection.close(); }

  private migrate(): void {
    const version = this.connection.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version < 1) this.connection.exec(`
      BEGIN;
      CREATE TABLE browser_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE sites (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        script TEXT, browser_profile_id TEXT NOT NULL REFERENCES browser_profiles(id) ON DELETE RESTRICT,
        timeout_ms INTEGER NOT NULL, schedule_enabled INTEGER NOT NULL DEFAULT 0,
        schedule_cron TEXT NOT NULL DEFAULT '0 9 * * *', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE run_records (
        id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed')), message TEXT, error TEXT,
        last_url TEXT, screenshot_path TEXT,
        trigger TEXT NOT NULL CHECK(trigger IN ('manual', 'schedule', 'batch'))
      );
      CREATE INDEX run_records_site_started ON run_records(site_id, started_at DESC);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE notification_channels (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        provider_type TEXT NOT NULL CHECK(provider_type IN ('ntfy', 'webhook')),
        enabled INTEGER NOT NULL DEFAULT 1,
        event_policy TEXT NOT NULL CHECK(event_policy IN ('all', 'normal', 'alert')),
        config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO settings(key, value) VALUES
        ('defaultTimeoutMs', '30000'), ('browserHeadless', 'false'),
        ('notificationEnabled', 'true'), ('notifyScheduledRuns', 'false'), ('language', 'en');
      PRAGMA user_version = 1;
      COMMIT;
    `);
    if (version.user_version < 2) this.connection.exec(`
      BEGIN;
      CREATE TABLE site_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      ALTER TABLE sites ADD COLUMN folder_id TEXT REFERENCES site_folders(id) ON DELETE SET NULL;
      CREATE INDEX sites_folder ON sites(folder_id);
      PRAGMA user_version = 2;
      COMMIT;
    `);
    if (version.user_version < 3) this.connection.exec(`
      BEGIN;
      ALTER TABLE site_folders ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE site_folders ADD COLUMN schedule_cron TEXT NOT NULL DEFAULT '0 9 * * *';
      PRAGMA user_version = 3;
      COMMIT;
    `);
    if (version.user_version < 4) this.connection.exec(`
      BEGIN;
      ALTER TABLE sites ADD COLUMN visit_options_json TEXT NOT NULL DEFAULT '{"stayMs":0,"detectChallenges":false,"check":"none","value":""}';
      PRAGMA user_version = 4;
      COMMIT;
    `);
    if (version.user_version < 5) this.connection.exec(`
      BEGIN;
      CREATE TABLE run_logs (run_id TEXT NOT NULL REFERENCES run_records(id) ON DELETE CASCADE, position INTEGER NOT NULL,
        level TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL, PRIMARY KEY(run_id, position));
      CREATE TABLE notification_receipts (id TEXT PRIMARY KEY, channel_name TEXT NOT NULL, title TEXT NOT NULL,
        success INTEGER NOT NULL, error TEXT, created_at TEXT NOT NULL);
      PRAGMA user_version = 5;
      COMMIT;
    `);
  }
}

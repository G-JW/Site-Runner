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
    if (version.user_version >= 1) return;
    this.connection.exec(`
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
        ('notificationEnabled', 'true'), ('notifyScheduledRuns', 'false');
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
}

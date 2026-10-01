import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AppSettings, BrowserProfile, NotificationChannel, NotificationChannelInput, RunRecord, Site, SiteInput } from '../../shared/types.js';
import cron from 'node-cron';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const asBoolean = (value: unknown) => value === 1;
function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`);
  return value.trim();
}

export function validateSite(input: SiteInput): SiteInput {
  const url = requiredText(input.url, 'URL');
  const parsed = new URL(url);
  if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) throw new Error('URL must use HTTP or HTTPS');
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 300_000) {
    throw new Error('Timeout must be between 1000 and 300000 milliseconds');
  }
  if (input.schedule.enabled && !cron.validate(input.schedule.cron)) throw new Error('Invalid cron expression');
  return {
    ...input, name: requiredText(input.name, 'Name'), url,
    browserProfileId: requiredText(input.browserProfileId, 'Browser profile'),
    script: input.script?.trim() || null,
    schedule: { enabled: Boolean(input.schedule.enabled), cron: requiredText(input.schedule.cron, 'Cron expression') },
  };
}

export class DataService {
  constructor(private readonly db: DatabaseSync) {}

  listSites(): Site[] {
    const rows = this.db.prepare(`SELECT s.*, r.id AS run_id, r.started_at AS run_started_at,
      r.finished_at AS run_finished_at, r.status AS run_status, r.message AS run_message,
      r.error AS run_error, r.last_url AS run_last_url, r.screenshot_path AS run_screenshot_path,
      r.trigger AS run_trigger FROM sites s LEFT JOIN run_records r ON r.id =
      (SELECT id FROM run_records WHERE site_id = s.id ORDER BY started_at DESC LIMIT 1)
      ORDER BY s.created_at ASC`).all() as Row[];
    return rows.map((row) => this.mapSite(row));
  }

  getSite(id: string): Site {
    const site = this.listSites().find((item) => item.id === id);
    if (!site) throw new Error('Site not found');
    return site;
  }

  saveSite(raw: SiteInput): Site {
    const input = validateSite(raw);
    this.getProfile(input.browserProfileId);
    const timestamp = now();
    const id = input.id ?? randomUUID();
    if (input.id) {
      const result = this.db.prepare(`UPDATE sites SET name = ?, url = ?, enabled = ?, script = ?,
        browser_profile_id = ?, timeout_ms = ?, schedule_enabled = ?, schedule_cron = ?, updated_at = ? WHERE id = ?`)
        .run(input.name, input.url, Number(input.enabled), input.script, input.browserProfileId,
          input.timeoutMs, Number(input.schedule.enabled), input.schedule.cron, timestamp, id);
      if (result.changes === 0) throw new Error('Site not found');
    } else {
      this.db.prepare(`INSERT INTO sites(id, name, url, enabled, script, browser_profile_id, timeout_ms,
        schedule_enabled, schedule_cron, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.name, input.url, Number(input.enabled), input.script, input.browserProfileId,
          input.timeoutMs, Number(input.schedule.enabled), input.schedule.cron, timestamp, timestamp);
    }
    return this.getSite(id);
  }

  removeSite(id: string): void {
    if (this.db.prepare('DELETE FROM sites WHERE id = ?').run(id).changes === 0) throw new Error('Site not found');
  }

  listProfiles(): BrowserProfile[] {
    return (this.db.prepare('SELECT * FROM browser_profiles ORDER BY created_at ASC').all() as Row[])
      .map((row) => ({ id: String(row.id), name: String(row.name), createdAt: String(row.created_at) }));
  }

  getProfile(id: string): BrowserProfile {
    const row = this.db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new Error('Browser profile not found');
    return { id: String(row.id), name: String(row.name), createdAt: String(row.created_at) };
  }

  createProfile(name: string): BrowserProfile {
    const profile = { id: randomUUID(), name: requiredText(name, 'Profile name'), createdAt: now() };
    this.db.prepare('INSERT INTO browser_profiles(id, name, created_at) VALUES (?, ?, ?)')
      .run(profile.id, profile.name, profile.createdAt);
    return profile;
  }

  removeProfile(id: string): void {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM sites WHERE browser_profile_id = ?').get(id) as { count: number };
    if (count.count > 0) throw new Error('Profile is used by one or more sites');
    if (this.db.prepare('DELETE FROM browser_profiles WHERE id = ?').run(id).changes === 0) throw new Error('Browser profile not found');
  }

  saveRun(record: RunRecord): void {
    this.db.prepare(`INSERT INTO run_records(id, site_id, started_at, finished_at, status, message,
      error, last_url, screenshot_path, trigger) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.siteId, record.startedAt, record.finishedAt, record.status,
        record.message, record.error, record.lastUrl, record.screenshotPath, record.trigger);
  }

  listRuns(siteId?: string): RunRecord[] {
    const sql = `SELECT r.*, s.name AS site_name FROM run_records r JOIN sites s ON s.id = r.site_id
      ${siteId ? 'WHERE r.site_id = ?' : ''} ORDER BY r.started_at DESC LIMIT 500`;
    const rows = (siteId ? this.db.prepare(sql).all(siteId) : this.db.prepare(sql).all()) as Row[];
    return rows.map((row) => this.mapRun(row));
  }

  getRun(id: string): RunRecord {
    const row = this.db.prepare(`SELECT r.*, s.name AS site_name FROM run_records r
      JOIN sites s ON s.id = r.site_id WHERE r.id = ?`).get(id) as Row | undefined;
    if (!row) throw new Error('Run record not found');
    return this.mapRun(row);
  }

  getSettings(): AppSettings {
    const values = Object.fromEntries((this.db.prepare('SELECT key, value FROM settings').all() as Row[])
      .map((row) => [String(row.key), String(row.value)]));
    return {
      defaultTimeoutMs: Number(values.defaultTimeoutMs ?? 30_000),
      browserHeadless: values.browserHeadless === 'true',
      notificationEnabled: values.notificationEnabled !== 'false',
      notifyScheduledRuns: values.notifyScheduledRuns === 'true',
      language: values.language === 'zh-CN' ? 'zh-CN' : 'en',
    };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = { ...this.getSettings(), ...patch };
    if (!Number.isInteger(current.defaultTimeoutMs) || current.defaultTimeoutMs < 1_000 || current.defaultTimeoutMs > 300_000) {
      throw new Error('Default timeout must be between 1000 and 300000 milliseconds');
    }
    if (current.language !== 'en' && current.language !== 'zh-CN') throw new Error('Unsupported language');
    const statement = this.db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(current)) statement.run(key, String(value));
    return current;
  }

  listChannels(): NotificationChannel[] {
    return (this.db.prepare('SELECT * FROM notification_channels ORDER BY created_at ASC').all() as Row[])
      .map((row) => this.mapChannel(row));
  }

  getChannel(id: string): NotificationChannel {
    const channel = this.listChannels().find((item) => item.id === id);
    if (!channel) throw new Error('Notification channel not found');
    return channel;
  }

  saveChannel(input: NotificationChannelInput): NotificationChannel {
    const name = requiredText(input.name, 'Channel name');
    const id = input.id ?? randomUUID();
    const timestamp = now();
    const config = JSON.stringify(input.config);
    if (input.id) {
      const result = this.db.prepare(`UPDATE notification_channels SET name = ?, provider_type = ?, enabled = ?,
        event_policy = ?, config_json = ?, updated_at = ? WHERE id = ?`)
        .run(name, input.providerType, Number(input.enabled), input.eventPolicy, config, timestamp, id);
      if (result.changes === 0) throw new Error('Notification channel not found');
    } else {
      this.db.prepare(`INSERT INTO notification_channels(id, name, provider_type, enabled, event_policy,
        config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, name, input.providerType, Number(input.enabled), input.eventPolicy, config, timestamp, timestamp);
    }
    return this.getChannel(id);
  }

  removeChannel(id: string): void {
    if (this.db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id).changes === 0) {
      throw new Error('Notification channel not found');
    }
  }

  private mapSite(row: Row): Site {
    return {
      id: String(row.id), name: String(row.name), url: String(row.url), enabled: asBoolean(row.enabled),
      script: row.script == null ? null : String(row.script), browserProfileId: String(row.browser_profile_id),
      timeoutMs: Number(row.timeout_ms), schedule: { enabled: asBoolean(row.schedule_enabled), cron: String(row.schedule_cron) },
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      lastRun: row.run_id == null ? null : this.mapRun({
        id: row.run_id, site_id: row.id, site_name: row.name, started_at: row.run_started_at,
        finished_at: row.run_finished_at, status: row.run_status, message: row.run_message,
        error: row.run_error, last_url: row.run_last_url, screenshot_path: row.run_screenshot_path, trigger: row.run_trigger,
      }),
    };
  }

  private mapRun(row: Row): RunRecord {
    return {
      id: String(row.id), siteId: String(row.site_id), siteName: String(row.site_name),
      startedAt: String(row.started_at), finishedAt: String(row.finished_at), status: row.status as RunRecord['status'],
      message: row.message == null ? null : String(row.message), error: row.error == null ? null : String(row.error),
      lastUrl: row.last_url == null ? null : String(row.last_url),
      screenshotPath: row.screenshot_path == null ? null : String(row.screenshot_path), trigger: row.trigger as RunRecord['trigger'],
    };
  }

  private mapChannel(row: Row): NotificationChannel {
    return {
      id: String(row.id), name: String(row.name), providerType: row.provider_type as NotificationChannel['providerType'],
      enabled: asBoolean(row.enabled), eventPolicy: row.event_policy as NotificationChannel['eventPolicy'],
      config: JSON.parse(String(row.config_json)) as Record<string, unknown>,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }
}

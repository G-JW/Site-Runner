import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AppSettings, BrowserProfile, NotificationChannel, NotificationChannelInput, RunRecord, Site, SiteInput } from '../../shared/types.js';
import cron from 'node-cron';
import type { ScriptTemplate, ScriptTemplateInput } from '../../shared/types.js';
import { legacyVisitOptions, validateVisitOptions } from '../../shared/visit-options.js';
import { validateTemplate } from '../template-files.js';
import type { SiteFolder, SiteSchedule, RunLogEntry, RunQuery, NotificationReceipt } from '../../shared/types.js';
import { defaultScriptTemplates } from '../../shared/script-templates.js';
import { defaultCleanupPolicy, validateCleanupPolicy } from '../../shared/cleanup.js';
import type { CleanupStatus } from '../../shared/types.js';

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
  if (input.schedule.mode && !['inherit', 'custom', 'manual'].includes(input.schedule.mode)) throw new Error('Invalid schedule mode');
  if (input.schedule.mode && input.schedule.enabled !== (input.schedule.mode === 'custom')) throw new Error('Schedule mode and enabled state disagree');
  if (input.schedule.enabled && !cron.validate(input.schedule.cron)) throw new Error('Invalid cron expression');
  return {
    ...input, ...(input.visitOptions ? { visitOptions: validateVisitOptions(input.visitOptions) } : {}), name: requiredText(input.name, 'Name'), url,
    browserProfileId: requiredText(input.browserProfileId, 'Browser profile'),
    script: input.script?.trim() || null,
    schedule: { enabled: Boolean(input.schedule.enabled), cron: requiredText(input.schedule.cron, 'Cron expression'), ...(input.schedule.mode ? { mode: input.schedule.mode } : {}) },
  };
}

export class DataService {
  constructor(private readonly db: DatabaseSync) {}

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  listTemplates(): ScriptTemplate[] {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'scriptTemplates'").get() as Row | undefined;
    if (!row) return this.restoreDefaultTemplates();
    return JSON.parse(String(row.value)) as ScriptTemplate[];
  }

  saveTemplate(input: ScriptTemplateInput): ScriptTemplate {
    const templates = this.listTemplates();
    const template: ScriptTemplate = { ...validateTemplate(input), id: input.id ?? randomUUID() };
    if (input.id) {
      const index = templates.findIndex((item) => item.id === input.id);
      if (index === -1) throw new Error('Template not found');
      templates[index] = template;
    } else templates.push(template);
    this.writeTemplates(templates);
    return template;
  }

  importTemplates(inputs: ScriptTemplateInput[]): ScriptTemplate[] {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 500) throw new Error('Select 1–500 templates');
    const validated = inputs.map(validateTemplate);
    const templates = this.listTemplates();
    const names = { en: new Set(templates.map((item) => item.name.en)), 'zh-CN': new Set(templates.map((item) => item.name['zh-CN'])) };
    const imported = validated.map((input) => {
      const name = { ...input.name };
      for (const language of ['en', 'zh-CN'] as const) {
        for (let index = 2; names[language].has(name[language]); index++) name[language] = `${input.name[language]} (${index})`;
        names[language].add(name[language]);
      }
      return { ...input, name, id: randomUUID() };
    });
    this.writeTemplates([...templates, ...imported]);
    return imported;
  }

  listFolders(): SiteFolder[] {
    return (this.db.prepare('SELECT * FROM site_folders ORDER BY name COLLATE NOCASE, id').all() as Row[])
      .map((row) => ({ id: String(row.id), name: String(row.name), schedule: { enabled: asBoolean(row.schedule_enabled), cron: String(row.schedule_cron) } }));
  }

  saveFolder(input: { id?: string; name: string; schedule?: SiteSchedule }): SiteFolder {
    const name = requiredText(input.name, 'Folder name');
    if (name.length > 80) throw new Error('Folder name must be at most 80 characters');
    if (this.listFolders().some((folder) => folder.id !== input.id && folder.name.toLowerCase() === name.toLowerCase())) throw new Error('Folder name already exists');
    const schedule = input.schedule ?? this.listFolders().find((folder) => folder.id === input.id)?.schedule ?? { enabled: false, cron: '0 9 * * *' };
    if (typeof schedule.enabled !== 'boolean' || !cron.validate(schedule.cron)) throw new Error('Invalid folder cron expression');
    const id = input.id ?? randomUUID();
    if (input.id) {
      if (!this.db.prepare('UPDATE site_folders SET name = ?, schedule_enabled = ?, schedule_cron = ? WHERE id = ?').run(name, Number(schedule.enabled), schedule.cron, id).changes) throw new Error('Folder not found');
    } else this.db.prepare('INSERT INTO site_folders(id, name, schedule_enabled, schedule_cron) VALUES (?, ?, ?, ?)').run(id, name, Number(schedule.enabled), schedule.cron);
    return { id, name, schedule: { ...schedule } };
  }

  removeFolder(id: string): void {
    if (!this.db.prepare('DELETE FROM site_folders WHERE id = ?').run(id).changes) throw new Error('Folder not found');
  }

  moveSites(ids: string[], folderId: string | null): void {
    if (!Array.isArray(ids) || !ids.length) throw new Error('Select sites to move');
    this.checkFolder(folderId);
    const uniqueIds = [...new Set(ids)];
    uniqueIds.forEach((id) => this.getSite(id));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const statement = this.db.prepare('UPDATE sites SET folder_id = ?, updated_at = ? WHERE id = ?');
      uniqueIds.forEach((id) => statement.run(folderId, now(), id));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private checkFolder(id: string | null): void {
    if (id !== null && !this.listFolders().some((folder) => folder.id === id)) throw new Error('Folder not found');
  }

  removeTemplate(id: string): void {
    const templates = this.listTemplates();
    if (!templates.some((item) => item.id === id)) throw new Error('Template not found');
    this.writeTemplates(templates.filter((item) => item.id !== id));
  }

  restoreDefaultTemplates(): ScriptTemplate[] {
    this.writeTemplates(defaultScriptTemplates);
    return this.listTemplates();
  }

  private writeTemplates(templates: ScriptTemplate[]): void {
    this.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('scriptTemplates', ?)").run(JSON.stringify(templates));
  }

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
    const folderId = input.folderId === undefined ? (input.id ? this.getSite(input.id).folderId : null) : input.folderId;
    this.checkFolder(folderId);
    const visitOptions = input.visitOptions ?? (input.id ? this.getSite(input.id).visitOptions : legacyVisitOptions);
    const timestamp = now();
    const id = input.id ?? randomUUID();
    if (input.id) {
      const result = this.db.prepare(`UPDATE sites SET name = ?, url = ?, enabled = ?, script = ?,
        browser_profile_id = ?, timeout_ms = ?, schedule_enabled = ?, schedule_cron = ?, folder_id = ?, visit_options_json = ?, schedule_mode = ?, updated_at = ? WHERE id = ?`)
        .run(input.name, input.url, Number(input.enabled), input.script, input.browserProfileId,
          input.timeoutMs, Number(input.schedule.enabled), input.schedule.cron, folderId, JSON.stringify(visitOptions), input.schedule.mode ?? null, timestamp, id);
      if (result.changes === 0) throw new Error('Site not found');
    } else {
      this.db.prepare(`INSERT INTO sites(id, name, url, enabled, script, browser_profile_id, timeout_ms,
        schedule_enabled, schedule_cron, folder_id, visit_options_json, schedule_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.name, input.url, Number(input.enabled), input.script, input.browserProfileId,
          input.timeoutMs, Number(input.schedule.enabled), input.schedule.cron, folderId, JSON.stringify(visitOptions), input.schedule.mode ?? null, timestamp, timestamp);
    }
    return this.getSite(id);
  }

  removeSite(id: string): void {
    if (this.db.prepare('DELETE FROM sites WHERE id = ?').run(id).changes === 0) throw new Error('Site not found');
  }

  importSiteRules(inputs: SiteInput[]): Site[] {
    const validated = inputs.map(validateSite);
    validated.forEach((input) => this.getProfile(input.browserProfileId));
    const usedNames = new Set(this.listSites().map((site) => site.name));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const sites = validated.map((input) => {
        let name = input.name;
        for (let index = 2; usedNames.has(name); index++) name = `${input.name} (${index})`;
        usedNames.add(name);
        return this.saveSite({ name, visitOptions: input.visitOptions ?? legacyVisitOptions, url: input.url, script: input.script, timeoutMs: input.timeoutMs, browserProfileId: input.browserProfileId,
          enabled: false, schedule: { ...input.schedule, enabled: false, ...(input.schedule.mode === 'custom' ? { mode: 'manual' as const } : {}) } });
      });
      this.db.exec('COMMIT');
      return sites;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
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

  saveRun(record: RunRecord, logs: RunLogEntry[] = []): void {
    this.transaction(() => {
    this.db.prepare(`INSERT INTO run_records(id, site_id, started_at, finished_at, status, message,
      error, last_url, screenshot_path, trigger) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.siteId, record.startedAt, record.finishedAt, record.status,
        record.message, record.error, record.lastUrl, record.screenshotPath, record.trigger);
    const statement = this.db.prepare('INSERT INTO run_logs(run_id, position, level, message, timestamp) VALUES (?, ?, ?, ?, ?)');
    logs.slice(-1000).forEach((entry, index) => statement.run(record.id, index, entry.level, entry.message.slice(0, 4000), entry.timestamp));
    });
  }

  searchRuns(query: RunQuery): RunRecord[] {
    const conditions: string[] = [], values: string[] = [];
    if (query.siteId) { conditions.push('r.site_id = ?'); values.push(query.siteId); }
    if (query.status) { if (!['success', 'failed'].includes(query.status)) throw new Error('Invalid status'); conditions.push('r.status = ?'); values.push(query.status); }
    for (const [field, operator] of [['from', '>='], ['to', '<=']] as const) {
      if (query[field]) { if (!/^\d{4}-\d{2}-\d{2}$/.test(query[field])) throw new Error('Invalid date'); conditions.push(`date(r.started_at, 'localtime') ${operator} ?`); values.push(query[field]); }
    }
    const offset = query.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid offset');
    return (this.db.prepare(`SELECT r.*, s.name AS site_name FROM run_records r JOIN sites s ON s.id = r.site_id
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY r.started_at DESC, r.id DESC LIMIT 50 OFFSET ?`).all(...values, offset) as Row[]).map((row) => this.mapRun(row));
  }

  runDetail(id: string): { run: RunRecord; logs: RunLogEntry[] } {
    const run = this.getRun(id);
    const logs = (this.db.prepare('SELECT * FROM run_logs WHERE run_id = ? ORDER BY position').all(id) as Row[])
      .map((row) => ({ siteId: run.siteId, level: row.level as RunLogEntry['level'], message: String(row.message), timestamp: String(row.timestamp) }));
    return { run, logs };
  }

  saveReceipt(input: Omit<NotificationReceipt, 'id' | 'createdAt'>): void {
    this.db.prepare('INSERT INTO notification_receipts VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), input.channelName, input.title, Number(input.success), input.error, now());
  }

  listReceipts(): NotificationReceipt[] {
    return (this.db.prepare('SELECT * FROM notification_receipts ORDER BY created_at DESC LIMIT 100').all() as Row[]).map((row) => ({ id: String(row.id), channelName: String(row.channel_name), title: String(row.title), success: asBoolean(row.success), error: row.error == null ? null : String(row.error), createdAt: String(row.created_at) }));
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
      theme: values.theme === 'light' || values.theme === 'dark' ? values.theme : 'system',
      density: values.density === 'compact' ? 'compact' : 'comfortable',
      cleanup: values.cleanup ? validateCleanupPolicy(JSON.parse(values.cleanup)) : { ...defaultCleanupPolicy },
    };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = { ...this.getSettings(), ...patch };
    if (!Number.isInteger(current.defaultTimeoutMs) || current.defaultTimeoutMs < 1_000 || current.defaultTimeoutMs > 300_000) {
      throw new Error('Default timeout must be between 1000 and 300000 milliseconds');
    }
    if (current.language !== 'en' && current.language !== 'zh-CN') throw new Error('Unsupported language');
    if (!['system', 'light', 'dark'].includes(current.theme)) throw new Error('Unsupported theme');
    if (!['comfortable', 'compact'].includes(current.density)) throw new Error('Unsupported density');
    current.cleanup = validateCleanupPolicy(current.cleanup);
    const statement = this.db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(current)) statement.run(key, key === 'cleanup' ? JSON.stringify(value) : String(value));
    return current;
  }

  cleanupCandidates(cutoff: string): { runs: string[]; receipts: string[]; retainedScreenshots: string[] } {
    return {
      runs: (this.db.prepare('SELECT id FROM run_records WHERE julianday(finished_at) < julianday(?)').all(cutoff) as Row[]).map((row) => String(row.id)),
      receipts: (this.db.prepare('SELECT id FROM notification_receipts WHERE julianday(created_at) < julianday(?)').all(cutoff) as Row[]).map((row) => String(row.id)),
      retainedScreenshots: (this.db.prepare('SELECT screenshot_path FROM run_records WHERE screenshot_path IS NOT NULL AND (julianday(finished_at) IS NULL OR julianday(finished_at) >= julianday(?))').all(cutoff) as Row[]).map((row) => String(row.screenshot_path)),
    };
  }

  deleteExpiredHistory(runs: string[], receipts: string[], cutoff: string): { runs: number; receipts: number } {
    return this.transaction(() => {
      const removeRun = this.db.prepare('DELETE FROM run_records WHERE id = ? AND julianday(finished_at) < julianday(?)');
      const removeReceipt = this.db.prepare('DELETE FROM notification_receipts WHERE id = ? AND julianday(created_at) < julianday(?)');
      return { runs: runs.reduce((total, id) => total + Number(removeRun.run(id, cutoff).changes), 0),
        receipts: receipts.reduce((total, id) => total + Number(removeReceipt.run(id, cutoff).changes), 0) };
    });
  }

  getCleanupStatus(): CleanupStatus | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'cleanupLastResult'").get() as Row | undefined;
    return row ? JSON.parse(String(row.value)) as CleanupStatus : null;
  }

  saveCleanupStatus(status: CleanupStatus): void {
    this.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES ('cleanupLastResult', ?)").run(JSON.stringify(status));
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
      visitOptions: validateVisitOptions(JSON.parse(String(row.visit_options_json))), folderId: row.folder_id == null ? null : String(row.folder_id), id: String(row.id), name: String(row.name), url: String(row.url), enabled: asBoolean(row.enabled),
      script: row.script == null ? null : String(row.script), browserProfileId: String(row.browser_profile_id),
      timeoutMs: Number(row.timeout_ms), schedule: { enabled: asBoolean(row.schedule_enabled), cron: String(row.schedule_cron), ...(row.schedule_mode ? { mode: row.schedule_mode as NonNullable<SiteSchedule['mode']> } : {}) },
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
      message: row.message == null ? null : legacyRunMessage(String(row.message)), error: row.error == null ? null : String(row.error),
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

// Keep stored history intact while hiding retired application-generated result labels.
function legacyRunMessage(message: string): string {
  switch (message) {
    case 'Automation completed; result not verified': return 'Automation completed';
    case 'Page loaded (no result assertion)': return 'Page loaded';
    case 'Page visited (login and business results not verified)': return 'Page visited';
    case 'Expected page content verified': return 'Page visited';
    default: return message;
  }
}

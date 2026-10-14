import cron from 'node-cron';
import type { AppSettings, ConfigurationFile } from '../shared/types.js';
import type { DataService } from './services/data-service.js';
import { exportSiteRules, parseSiteRules } from './site-rules.js';
import { exportTemplates, parseTemplateFile } from './template-files.js';
import { defaultCleanupPolicy, validateCleanupPolicy } from '../shared/cleanup.js';

export function exportConfiguration(data: DataService): ConfigurationFile {
  const profiles = data.listProfiles(), folders = data.listFolders(), sites = data.listSites();
  const profileKeys = new Map(profiles.map((profile, index) => [profile.id, `p${index}`]));
  const folderKeys = new Map(folders.map((folder, index) => [folder.id, `f${index}`]));
  return { format: 'site-runner-configuration', version: 1,
    profiles: profiles.map((profile) => ({ key: profileKeys.get(profile.id)!, name: profile.name })),
    folders: folders.map((folder) => ({ key: folderKeys.get(folder.id)!, name: folder.name, schedule: { ...folder.schedule } })),
    sites: exportSiteRules(sites).sites.map((rule, index) => ({ ...rule, profileKey: profileKeys.get(sites[index]!.browserProfileId)!, folderKey: sites[index]!.folderId ? folderKeys.get(sites[index]!.folderId!)! : null })),
    templates: exportTemplates(data.listTemplates()).templates, settings: data.getSettings(),
  };
}

function validSettings(value: AppSettings): AppSettings {
  if (!value || !Number.isInteger(value.defaultTimeoutMs) || value.defaultTimeoutMs < 1000 || value.defaultTimeoutMs > 300000 || !['en', 'zh-CN'].includes(value.language)) throw new Error('Invalid backup settings');
  for (const field of ['browserHeadless', 'notificationEnabled', 'notifyScheduledRuns'] as const) if (typeof value[field] !== 'boolean') throw new Error('Invalid backup settings');
  if (value.theme !== undefined && !['system', 'light', 'dark'].includes(value.theme)) throw new Error('Invalid backup theme');
  if (value.density !== undefined && !['comfortable', 'compact'].includes(value.density)) throw new Error('Invalid backup density');
  return { theme: value.theme ?? 'system', density: value.density ?? 'comfortable', defaultTimeoutMs: value.defaultTimeoutMs, browserHeadless: value.browserHeadless, notificationEnabled: value.notificationEnabled, notifyScheduledRuns: value.notifyScheduledRuns, language: value.language, cleanup: value.cleanup === undefined ? { ...defaultCleanupPolicy } : validateCleanupPolicy(value.cleanup) };
}

export function parseConfiguration(value: unknown): ConfigurationFile {
  if (!value || typeof value !== 'object') throw new Error('Invalid configuration file');
  const file = value as ConfigurationFile;
  if (file.format !== 'site-runner-configuration' || file.version !== 1) throw new Error('Expected a version 1 Site Runner configuration file');
  for (const field of ['profiles', 'folders', 'sites', 'templates'] as const) if (!Array.isArray(file[field]) || file[field].length > 500) throw new Error('Invalid configuration list');
  const validateNames = (items: Array<{ key: string; name: string }>) => {
    const keys = new Set<string>();
    return items.map((item) => {
      if (!item || typeof item.key !== 'string' || !item.key || keys.has(item.key) || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Invalid configuration name or key');
      keys.add(item.key); return { key: item.key, name: item.name.trim() };
    });
  };
  const profiles = validateNames(file.profiles), folderNames = validateNames(file.folders);
  const folders = folderNames.map((folder, index) => {
    if (folder.name.length > 80) throw new Error('Folder name too long');
    const schedule = file.folders[index]!.schedule;
    if (!schedule || typeof schedule.enabled !== 'boolean' || typeof schedule.cron !== 'string' || !cron.validate(schedule.cron)) throw new Error('Invalid folder schedule');
    return { ...folder, schedule: { enabled: schedule.enabled, cron: schedule.cron } };
  });
  const rules = file.sites.length ? parseSiteRules({ format: 'site-runner-sites', version: 1, sites: file.sites }) : [];
  const sites = rules.map((rule, index) => {
    const original = file.sites[index]!;
    if (!profiles.some((profile) => profile.key === original.profileKey) || (original.folderKey !== null && !folders.some((folder) => folder.key === original.folderKey))) throw new Error('Invalid profile or folder reference');
    return { ...rule, profileKey: original.profileKey, folderKey: original.folderKey };
  });
  const templates = file.templates.length ? parseTemplateFile({ format: 'site-runner-templates', version: 1, templates: file.templates }) : [];
  return { format: file.format, version: 1, profiles, folders, sites, templates, settings: validSettings(file.settings) };
}

export function importConfiguration(data: DataService, value: unknown, applySettings: boolean) {
  const file = parseConfiguration(value);
  return data.transaction(() => {
    function unique(name: string, names: Set<string>, maxLength = Infinity) {
      let next = name; for (let index = 2; names.has(next.toLowerCase()); index++) { const suffix = ` (${index})`; next = name.slice(0, maxLength - suffix.length) + suffix; }
      names.add(next.toLowerCase()); return next;
    }
    const profileNames = new Set(data.listProfiles().map((profile) => profile.name.toLowerCase()));
    const profiles = new Map(file.profiles.map((profile) => [profile.key, data.createProfile(unique(profile.name, profileNames)).id]));
    const folderNames = new Set(data.listFolders().map((folder) => folder.name.toLowerCase()));
    const folders = new Map(file.folders.map((folder) => [folder.key, data.saveFolder({ name: unique(folder.name, folderNames, 80), schedule: { ...folder.schedule, enabled: false } }).id]));
    const siteNames = new Set(data.listSites().map((site) => site.name.toLowerCase()));
    file.sites.forEach((site) => data.saveSite({ ...site, name: unique(site.name, siteNames), browserProfileId: profiles.get(site.profileKey)!, folderId: site.folderKey === null ? null : folders.get(site.folderKey)!, enabled: false, schedule: { ...site.schedule, enabled: false, ...(site.schedule.mode === 'custom' ? { mode: 'manual' as const } : {}) } }));
    if (file.templates.length) data.importTemplates(file.templates);
    if (applySettings) data.updateSettings({ ...file.settings, cleanup: { ...file.settings.cleanup, automatic: false } });
    return { sites: file.sites.length, templates: file.templates.length };
  });
}

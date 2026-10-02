import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { defaultScriptTemplates } from '../src/shared/script-templates.js';

function databasePath() { return path.join(mkdtempSync(path.join(tmpdir(), 'site-runner-templates-')), 'data.sqlite3'); }

describe('persistent template library', () => {
  it('initializes existing databases and preserves edits, deletions and an empty library across restarts', () => {
    const file = databasePath();
    let database = new AppDatabase(file);
    try {
      let data = new DataService(database.connection);
      expect(database.connection.prepare("SELECT value FROM settings WHERE key = 'scriptTemplates'").get()).toBeUndefined();
      expect(data.listTemplates()).toEqual(defaultScriptTemplates);
      const custom = data.saveTemplate({ name: { en: 'Custom', 'zh-CN': '自定义' }, description: { en: '', 'zh-CN': '' }, instructions: { en: '', 'zh-CN': '' }, script: 'export default async function run() {}' });
      data.saveTemplate({ ...custom, script: '  export default async function run() { return; }  ' });
      data.removeTemplate('visit');
      database.close(); database = new AppDatabase(file); data = new DataService(database.connection);
      expect(data.listTemplates()).toHaveLength(6);
      expect(data.listTemplates().some((item) => item.id === 'visit')).toBe(false);
      expect(data.listTemplates().find((item) => item.id === custom.id)?.script).toBe('export default async function run() { return; }');
      data.listTemplates().forEach((template) => data.removeTemplate(template.id));
      database.close(); database = new AppDatabase(file); data = new DataService(database.connection);
      expect(data.listTemplates()).toEqual([]);
      expect(data.restoreDefaultTemplates()).toEqual(defaultScriptTemplates);
    } finally { database.close(); }
  });

  it('restores exactly the original six without changing sites, settings, profiles or channels', () => {
    const database = new AppDatabase(databasePath());
    try {
      const data = new DataService(database.connection);
      const profile = data.createProfile('Default');
      const template = data.listTemplates().find((item) => item.id === 'click')!;
      const site = data.saveSite({ name: 'Copied script', url: 'https://example.com', enabled: true, script: template.script, browserProfileId: profile.id, timeoutMs: 1000, schedule: { enabled: false, cron: '0 9 * * *' } });
      const channel = data.saveChannel({ name: 'Test', providerType: 'webhook', enabled: false, eventPolicy: 'all', config: { url: 'https://example.com' } });
      const settings = data.updateSettings({ language: 'zh-CN', browserHeadless: true });
      data.saveTemplate({ ...template, script: null });
      data.removeTemplate('form');
      data.saveTemplate({ name: template.name, description: template.description, instructions: template.instructions, script: template.script });
      expect(data.restoreDefaultTemplates()).toEqual(defaultScriptTemplates);
      expect(data.getSite(site.id)).toEqual(site);
      expect(data.getSettings()).toEqual(settings);
      expect(data.listProfiles()).toEqual([profile]);
      expect(data.listChannels()).toEqual([channel]);
      const returned = data.listTemplates(); returned[0]!.name.en = 'Changed outside storage';
      expect(data.listTemplates()).toEqual(defaultScriptTemplates);
    } finally { database.close(); }
  });

  it('rejects invalid updates without modifying the library and normalizes blank scripts', () => {
    const database = new AppDatabase(databasePath());
    try {
      const data = new DataService(database.connection);
      const template = data.listTemplates()[0]!;
      expect(() => data.saveTemplate({ ...template, name: { en: '', 'zh-CN': '名称' } })).toThrow(/name/);
      expect(() => data.saveTemplate({ ...template, id: 'missing' })).toThrow(/not found/);
      expect(() => data.removeTemplate('missing')).toThrow(/not found/);
      expect(data.listTemplates()).toEqual(defaultScriptTemplates);
      expect(data.saveTemplate({ ...template, script: '  ' }).script).toBeNull();
    } finally { database.close(); }
  });
});

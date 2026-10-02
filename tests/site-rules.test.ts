import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { exportSiteRules, parseSiteRules } from '../src/main/site-rules.js';

it('round-trips portable rules without local identities, history or notification credentials', () => {
  const database = new AppDatabase(path.join(mkdtempSync(path.join(tmpdir(), 'site-rules-')), 'test.sqlite3'));
  try {
    const data = new DataService(database.connection); const profile = data.createProfile('Private profile');
    const site = data.saveSite({ name: 'Check-in', url: 'https://example.com', enabled: true, script: 'export default async function run() {}', browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: true, cron: '0 9 * * *' } });
    data.saveChannel({ name: 'Private', enabled: true, eventPolicy: 'all', providerType: 'ntfy', config: { token: 'private-token' } });
    const serialized = JSON.stringify(exportSiteRules([site]));
    expect(serialized).not.toContain(profile.id); expect(serialized).not.toContain(site.id); expect(serialized).not.toContain('private-token');
    const rules = parseSiteRules(JSON.parse(serialized));
    expect(rules[0]).toMatchObject({ name: site.name, script: site.script, schedule: site.schedule });
    const imported = data.importSiteRules(rules.map((rule) => ({ ...rule, browserProfileId: profile.id })));
    expect(imported[0]).toMatchObject({ name: 'Check-in (2)', enabled: false, script: site.script, schedule: { enabled: false, cron: '0 9 * * *' } });
    expect(imported[0]!.id).not.toBe(site.id); expect(data.getSite(site.id)).toEqual(site);
  } finally { database.close(); }
});

it('rejects malformed bundles and rolls back a failed multi-site import', () => {
  const database = new AppDatabase(path.join(mkdtempSync(path.join(tmpdir(), 'site-rules-')), 'test.sqlite3'));
  try {
    const data = new DataService(database.connection); const profile = data.createProfile('Default');
    const rule = { name: 'Good', url: 'https://example.com', enabled: true, script: null, timeoutMs: 1000, schedule: { enabled: true, cron: '* * * * *' } };
    for (const file of [null, { format: 'unknown', version: 1, sites: [rule] }, { format: 'site-runner-sites', version: 2, sites: [rule] }, { format: 'site-runner-sites', version: 1, sites: [{ ...rule, timeoutMs: 0 }] }, { format: 'site-runner-sites', version: 1, sites: [{ ...rule, schedule: { enabled: true, cron: 'invalid' } }] }]) expect(() => parseSiteRules(file)).toThrow();
    database.connection.exec("CREATE TRIGGER reject_bad BEFORE INSERT ON sites WHEN NEW.name = 'Bad' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => data.importSiteRules([{ ...rule, browserProfileId: profile.id }, { ...rule, name: 'Bad', browserProfileId: profile.id }])).toThrow(/test failure/);
    expect(data.listSites()).toEqual([]);
  } finally { database.close(); }
});

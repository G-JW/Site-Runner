import type { Site, SiteInput } from '../shared/types.js';
import { validateSite } from './services/data-service.js';

export type SiteRule = Omit<SiteInput, 'id' | 'browserProfileId'>;
export interface SiteRulesFile { format: 'site-runner-sites'; version: 1; sites: SiteRule[] }

export function exportSiteRules(sites: Site[]): SiteRulesFile {
  return { format: 'site-runner-sites', version: 1, sites: sites.map(({ name, url, enabled, script, timeoutMs, schedule, visitOptions }) => ({ name, url, enabled, script, timeoutMs, visitOptions, schedule: { ...schedule } })) };
}

export function parseSiteRules(value: unknown): SiteRule[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid site rules file');
  const file = value as Partial<SiteRulesFile>;
  if (file.format !== 'site-runner-sites' || file.version !== 1 || !Array.isArray(file.sites) || file.sites.length === 0 || file.sites.length > 500) {
    throw new Error('Expected a version 1 Site Runner rules file with 1–500 sites');
  }
  return file.sites.map((raw) => {
    if (!raw || typeof raw !== 'object' || typeof raw.enabled !== 'boolean' || !raw.schedule || typeof raw.schedule.enabled !== 'boolean' || typeof raw.schedule.cron !== 'string' || (raw.script !== null && typeof raw.script !== 'string')) {
      throw new Error('Invalid site rule');
    }
    const site = validateSite({ ...(raw.visitOptions ? { visitOptions: raw.visitOptions } : {}), name: raw.name, url: raw.url, enabled: raw.enabled, script: raw.script, timeoutMs: raw.timeoutMs, schedule: { enabled: raw.schedule.enabled, cron: raw.schedule.cron }, browserProfileId: 'import-validation' });
    const { name, url, enabled, script, timeoutMs, schedule, visitOptions } = site;
    return { name, url, enabled, script, timeoutMs, schedule, ...(visitOptions ? { visitOptions } : {}) };
  });
}

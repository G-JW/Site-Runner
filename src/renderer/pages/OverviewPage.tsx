import type { BrowserProfile, RunRecord, Site } from '../../shared/types';
import type { PageName } from '../App';
import { PageHeader } from '../App';
import { useI18n } from '../i18n';

export function OverviewPage({ sites, profiles, latestRun, batchRunning, onNavigate, onRunAll }: {
  sites: Site[]; profiles: BrowserProfile[]; latestRun: RunRecord | null; batchRunning: boolean;
  onNavigate(page: PageName): void; onRunAll(): Promise<void>;
}) {
  const { language, t } = useI18n();
  const active = sites.filter((site) => site.enabled).length;
  return <>
    <PageHeader eyebrow={t('overview.eyebrow')} title={t('overview.title')} description={t('overview.description')}
      actions={<button className="primary" disabled={active === 0 || batchRunning} onClick={() => void onRunAll()}>{batchRunning ? t('overview.runningBatch') : t('overview.runAll')}</button>} />
    <section className="metric-grid">
      <article><span>{t('overview.activeSites')}</span><strong>{active}</strong><small>{t('overview.configured', { count: sites.length })}</small></article>
      <article><span>{t('overview.profiles')}</span><strong>{profiles.length}</strong><small>{t('overview.private')}</small></article>
      <article><span>{t('overview.lastRun')}</span><strong className={latestRun?.status === 'failed' ? 'text-danger' : ''}>{latestRun ? t(`common.${latestRun.status}`) : '—'}</strong><small>{latestRun ? new Date(latestRun.finishedAt).toLocaleString(language) : t('overview.noRuns')}</small></article>
    </section>
    {sites.length === 0 ? <section className="panel empty-state"><div className="empty-icon">↗</div><h2>{t('overview.firstTitle')}</h2><p>{t('overview.firstDescription')}</p><div><button className="primary" onClick={() => onNavigate('profiles')}>{t('overview.createProfile')}</button><button className="secondary" onClick={() => onNavigate('sites')}>{t('overview.addSite')}</button></div></section>
      : <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">{t('overview.currentSetup')}</span><h2>{t('overview.yourSites')}</h2></div><button className="text-button" onClick={() => onNavigate('sites')}>{t('overview.manageSites')}</button></div>{sites.slice(0, 5).map((site) => <div className="activity-row" key={site.id}><span className={`site-avatar ${site.enabled ? '' : 'muted'}`}>{site.name.slice(0, 1).toUpperCase()}</span><div><strong>{site.name}</strong><small>{site.url}</small></div><span className={`badge ${site.lastRun?.status ?? 'idle'}`}>{site.lastRun ? t(`common.${site.lastRun.status}`) : t('common.notRun')}</span></div>)}</section>}
  </>;
}

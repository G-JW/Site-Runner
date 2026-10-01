import type { BrowserProfile, RunRecord, Site } from '../../shared/types';
import type { PageName } from '../App';
import { PageHeader } from '../App';

export function OverviewPage({ sites, profiles, latestRun, onNavigate }: {
  sites: Site[]; profiles: BrowserProfile[]; latestRun: RunRecord | null; onNavigate(page: PageName): void;
}) {
  const active = sites.filter((site) => site.enabled).length;
  return <>
    <PageHeader eyebrow="AUTOMATION CONTROL" title="Good evening." description="Your local routines, profiles and results in one place."
      actions={<button className="primary" disabled={active === 0}>Run all enabled</button>} />
    <section className="metric-grid">
      <article><span>Active sites</span><strong>{active}</strong><small>{sites.length} configured</small></article>
      <article><span>Profiles</span><strong>{profiles.length}</strong><small>Local and private</small></article>
      <article><span>Last run</span><strong className={latestRun?.status === 'failed' ? 'text-danger' : ''}>{latestRun ? latestRun.status : '—'}</strong><small>{latestRun ? new Date(latestRun.finishedAt).toLocaleString() : 'No runs yet'}</small></article>
    </section>
    {sites.length === 0 ? <section className="panel empty-state"><div className="empty-icon">↗</div><h2>Build your first routine</h2><p>Create a browser profile, sign in once, then add a site automation.</p><div><button className="primary" onClick={() => onNavigate('profiles')}>Create profile</button><button className="secondary" onClick={() => onNavigate('sites')}>Add site</button></div></section>
      : <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">CURRENT SETUP</span><h2>Your sites</h2></div><button className="text-button" onClick={() => onNavigate('sites')}>Manage sites →</button></div>{sites.slice(0, 5).map((site) => <div className="activity-row" key={site.id}><span className={`site-avatar ${site.enabled ? '' : 'muted'}`}>{site.name.slice(0, 1).toUpperCase()}</span><div><strong>{site.name}</strong><small>{site.url}</small></div><span className={`badge ${site.lastRun?.status ?? 'idle'}`}>{site.lastRun?.status ?? 'Not run'}</span></div>)}</section>}
  </>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppInfo, BrowserProfile, RunRecord, Site } from '../shared/types';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { RunHistoryPage } from './pages/RunHistoryPage';
import { SitesPage } from './pages/SitesPage';

export type PageName = 'overview' | 'sites' | 'profiles' | 'history' | 'notifications' | 'settings';

const navigation: { id: PageName; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'sites', label: 'Sites', icon: '◎' },
  { id: 'profiles', label: 'Profiles', icon: '◫' },
  { id: 'history', label: 'Run history', icon: '↻' },
  { id: 'notifications', label: 'Notifications', icon: '◇' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function App() {
  const [page, setPage] = useState<PageName>('overview');
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextSites, nextProfiles, nextRuns] = await Promise.all([
      window.siteRunner.sites.list(), window.siteRunner.profiles.list(), window.siteRunner.runs.list(),
    ]);
    setSites(nextSites); setProfiles(nextProfiles); setRuns(nextRuns);
  }, []);

  useEffect(() => {
    void window.siteRunner.app.info().then(setInfo);
    queueMicrotask(() => {
      void refresh().catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
    });
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const latestBatch = useMemo(() => runs[0] ?? null, [runs]);
  const showError = (error: unknown) => setNotice(error instanceof Error ? error.message : String(error));
  const pageContent = (() => {
    if (page === 'sites') return <SitesPage sites={sites} profiles={profiles} onChange={refresh} onError={showError} />;
    if (page === 'profiles') return <ProfilesPage profiles={profiles} onChange={refresh} onError={showError} />;
    if (page === 'history') return <RunHistoryPage runs={runs} sites={sites} onError={showError} />;
    if (page === 'notifications') return <Placeholder title="Notification channels" text="NTFY and webhook channels will appear here after the automation pipeline is connected." />;
    if (page === 'settings') return <Placeholder title="Settings" text={`Local data is stored in ${info?.userDataPath ?? 'the Electron userData folder'}.`} />;
    return <OverviewPage sites={sites} profiles={profiles} latestRun={latestBatch} onNavigate={setPage} />;
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>Site Runner</span></div>
        <nav>{navigation.map((item) => (
          <button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => setPage(item.id)}>
            <span className="nav-icon">{item.icon}</span>{item.label}
          </button>
        ))}</nav>
        <div className="sidebar-foot"><span className="status-dot" /> Local desktop · v{info?.version ?? '—'}</div>
      </aside>
      <main>{pageContent}</main>
      {notice && <div className="toast" role="alert">{notice}</div>}
    </div>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <><PageHeader eyebrow="SITE RUNNER" title={title} description={text} /><section className="panel empty-state compact"><div className="empty-icon">◇</div><h2>Coming into focus</h2><p>This section is part of the current desktop migration.</p></section></>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</header>;
}

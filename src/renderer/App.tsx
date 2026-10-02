import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppInfo, BrowserProfile, RunRecord, Site, ScriptTemplate } from '../shared/types';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { RunHistoryPage } from './pages/RunHistoryPage';
import { SitesPage } from './pages/SitesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { useI18n } from './i18n';
import { TemplatesPage } from './pages/TemplatesPage';

export type PageName = 'overview' | 'sites' | 'templates' | 'profiles' | 'history' | 'notifications' | 'settings';

const navigation = [
  { id: 'overview', label: 'nav.overview', icon: '⌂' },
  { id: 'sites', label: 'nav.sites', icon: '◎' },
  { id: 'templates', label: 'nav.templates', icon: '▤' },
  { id: 'profiles', label: 'nav.profiles', icon: '◫' },
  { id: 'history', label: 'nav.history', icon: '↻' },
  { id: 'notifications', label: 'nav.notifications', icon: '◇' },
  { id: 'settings', label: 'nav.settings', icon: '⚙' },
] as const;

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<PageName>('overview');
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [siteTemplate, setSiteTemplate] = useState<ScriptTemplate | null>(null);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);

  const refresh = useCallback(async () => {
    const [nextSites, nextProfiles, nextRuns, nextTemplates] = await Promise.all([
      window.siteRunner.sites.list(), window.siteRunner.profiles.list(), window.siteRunner.runs.list(), window.siteRunner.templates.list(),
    ]);
    setSites(nextSites); setProfiles(nextProfiles); setRuns(nextRuns);
    setTemplates(nextTemplates);
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
  const showError = useCallback((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)), []);
  const pageContent = (() => {
    if (page === 'sites') return <SitesPage sites={sites} profiles={profiles} templates={templates} initialTemplate={siteTemplate} onTemplateConsumed={() => setSiteTemplate(null)} onChange={refresh} onError={showError} />;
    if (page === 'templates') return <TemplatesPage templates={templates} onChange={refresh} onError={showError} canCreate={profiles.length > 0} onUse={(template) => { setSiteTemplate(template); setPage('sites'); }} />;
    if (page === 'profiles') return <ProfilesPage profiles={profiles} onChange={refresh} onError={showError} />;
    if (page === 'history') return <RunHistoryPage runs={runs} sites={sites} onError={showError} />;
    if (page === 'notifications') return <NotificationsPage onError={showError} />;
    if (page === 'settings') return <SettingsPage info={info} onError={showError} />;
    return <OverviewPage sites={sites} profiles={profiles} latestRun={latestBatch} batchRunning={batchRunning} onNavigate={setPage} onRunAll={async () => {
      setBatchRunning(true);
      try {
        const result = await window.siteRunner.runs.runEnabledSites();
        setNotice(t('batch.completed', { success: result.success, failed: result.failed }));
        await refresh();
      } catch (error) { showError(error); } finally { setBatchRunning(false); }
    }} />;
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>Site Runner</span></div>
        <nav>{navigation.map((item) => (
          <button data-testid={`nav-${item.id}`} className={page === item.id ? 'active' : ''} key={item.id} onClick={() => setPage(item.id)}>
            <span className="nav-icon">{item.icon}</span>{t(item.label)}
          </button>
        ))}</nav>
        <div className="sidebar-foot"><span className="status-dot" /> {t('app.local')} · v{info?.version ?? '—'}</div>
      </aside>
      <main>{pageContent}</main>
      {notice && <div className="toast" role="alert">{notice}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</header>;
}

import { useEffect, useState } from 'react';
import type { AppInfo } from '../shared/types';

const nav = ['Overview', 'Sites', 'Profiles', 'Run history', 'Notifications'];

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.siteRunner.app.info().then(setInfo);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>Site Runner</span></div>
        <nav>{nav.map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}</nav>
        <div className="sidebar-foot"><span className="status-dot" /> Local desktop · v{info?.version ?? '—'}</div>
      </aside>
      <main>
        <header><div><span className="eyebrow">AUTOMATION CONTROL</span><h1>Good evening.</h1><p>Your local routines, profiles and results in one place.</p></div><button className="primary">Run all enabled</button></header>
        <section className="metric-grid">
          <article><span>Active sites</span><strong>0</strong><small>Ready to configure</small></article>
          <article><span>Profiles</span><strong>0</strong><small>Local and private</small></article>
          <article><span>Last batch</span><strong>—</strong><small>No runs yet</small></article>
        </section>
        <section className="panel empty-state"><div className="empty-icon">↗</div><h2>Build your first routine</h2><p>Create a browser profile, sign in once, then add a site automation.</p><div><button className="primary">Create profile</button><button className="secondary">Add site</button></div></section>
      </main>
    </div>
  );
}

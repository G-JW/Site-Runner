import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings } from '../../shared/types';
import { PageHeader } from '../App';

export function SettingsPage({ info, onError }: { info: AppInfo | null; onError(error: unknown): void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => { queueMicrotask(() => void window.siteRunner.settings.get().then(setSettings).catch(onError)); }, [onError]);
  async function update(patch: Partial<AppSettings>) {
    if (!settings) return;
    try { setSettings(await window.siteRunner.settings.update(patch)); } catch (error) { onError(error); }
  }
  return <><PageHeader eyebrow="LOCAL PREFERENCES" title="Settings" description="Defaults apply to this device and stay in the Electron userData folder." />
    {settings && <section className="panel settings-panel"><div className="setting-row"><div><strong>Default timeout</strong><p>Used when creating new site configurations.</p></div><input type="number" min="1000" max="300000" value={settings.defaultTimeoutMs} onChange={(event) => void update({ defaultTimeoutMs: Number(event.target.value) })} /></div><div className="setting-row"><div><strong>Headless browser</strong><p>Keep disabled while building and debugging automations.</p></div><label className="toggle-label"><input type="checkbox" checked={settings.browserHeadless} onChange={(event) => void update({ browserHeadless: event.target.checked })} /><span /></label></div><div className="setting-row"><div><strong>Batch notifications</strong><p>Route final summaries to matching enabled channels.</p></div><label className="toggle-label"><input type="checkbox" checked={settings.notificationEnabled} onChange={(event) => void update({ notificationEnabled: event.target.checked })} /><span /></label></div><div className="setting-row"><div><strong>Scheduled run notifications</strong><p>Reserved for optional per-site schedule delivery.</p></div><label className="toggle-label"><input type="checkbox" checked={settings.notifyScheduledRuns} onChange={(event) => void update({ notifyScheduledRuns: event.target.checked })} /><span /></label></div><div className="setting-row path-row"><div><strong>Local data</strong><p>{info?.userDataPath ?? 'Loading…'}</p></div></div></section>}
  </>;
}

import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useState } from 'react';
import type { BrowserProfile, RunLogEntry, Site, SiteInput } from '../../shared/types';
import { PageHeader } from '../App';

const template = `export default async function run({ page, log, config }: AutomationContext) {
  log.info('Checking site state');
  // Example: await page.getByRole('button', { name: '签到' }).click();
}`;

export function SitesPage({ sites, profiles, onChange, onError }: { sites: Site[]; profiles: BrowserProfile[]; onChange(): Promise<void>; onError(error: unknown): void }) {
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(30_000);
  const profileNames = useMemo(() => Object.fromEntries(profiles.map((item) => [item.id, item.name])), [profiles]);
  useEffect(() => window.siteRunner.runs.onLog((entry) => setLogs((current) => [...current.slice(-199), entry])), []);
  useEffect(() => {
    queueMicrotask(() => void window.siteRunner.settings.get().then((settings) => setDefaultTimeoutMs(settings.defaultTimeoutMs)).catch(onError));
  }, [onError]);
  async function toggle(site: Site) {
    try { await window.siteRunner.sites.save({ ...site, enabled: !site.enabled }); await onChange(); } catch (error) { onError(error); }
  }
  async function remove(site: Site) {
    if (!window.confirm(`Delete site “${site.name}” and its run history?`)) return;
    try { await window.siteRunner.sites.remove(site.id); await onChange(); } catch (error) { onError(error); }
  }
  async function run(site: Site) {
    setRunning((current) => new Set(current).add(site.id));
    setLogs((current) => [...current, { siteId: site.id, level: 'info', message: `Starting ${site.name}`, timestamp: new Date().toISOString() }]);
    try { await window.siteRunner.runs.runSite(site.id); await onChange(); } catch (error) { onError(error); }
    finally { setRunning((current) => { const next = new Set(current); next.delete(site.id); return next; }); }
  }
  return <><PageHeader eyebrow="AUTOMATION LIBRARY" title="Sites" description="Manage destinations, schedules and trusted local Playwright scripts." actions={<button className="primary" disabled={profiles.length === 0} onClick={() => setEditing('new')}>Add site</button>} />
    {profiles.length === 0 && <div className="callout">Create a browser profile before adding your first site.</div>}
    <section className="panel table-panel sites-table"><div className="table-head"><span>Site</span><span>Profile</span><span>Schedule</span><span>Last run</span><span>Actions</span></div>
      {sites.length === 0 ? <div className="table-empty">No sites configured yet.</div> : sites.map((site) => <div className="table-row" key={site.id}><div className="site-cell"><button className={`toggle ${site.enabled ? 'on' : ''}`} aria-label={`Toggle ${site.name}`} onClick={() => void toggle(site)}><span /></button><div><strong>{site.name}</strong><small>{site.url}</small></div></div><span>{profileNames[site.browserProfileId] ?? 'Unknown'}</span><span>{site.schedule.enabled ? site.schedule.cron : 'Off'}</span><span><i className={`result-dot ${site.lastRun?.status ?? 'idle'}`} />{running.has(site.id) ? 'Running…' : (site.lastRun?.status ?? 'Not run')}</span><div className="row-actions"><button disabled={running.has(site.id)} onClick={() => void run(site)}>Run</button><button onClick={() => setEditing(site)}>Edit</button><button className="danger-ghost" onClick={() => void remove(site)}>Delete</button></div></div>)}</section>
    {logs.length > 0 && <section className="panel log-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE OUTPUT</span><h2>Run log</h2></div><button className="text-button" onClick={() => setLogs([])}>Clear</button></div><div className="log-lines">{logs.map((entry, index) => <div className={entry.level} key={`${entry.timestamp}-${index}`}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><span>{entry.level}</span><p>{entry.message}</p></div>)}</div></section>}
    {editing && <SiteEditor site={editing === 'new' ? null : editing} profiles={profiles} defaultTimeoutMs={defaultTimeoutMs} onClose={() => setEditing(null)} onSaved={async (saved, runAfter) => { setEditing(null); await onChange(); if (runAfter) await run(saved); }} onError={onError} />}
  </>;
}

function SiteEditor({ site, profiles, defaultTimeoutMs, onClose, onSaved, onError }: { site: Site | null; profiles: BrowserProfile[]; defaultTimeoutMs: number; onClose(): void; onSaved(site: Site, runAfter: boolean): Promise<void>; onError(error: unknown): void }) {
  const [form, setForm] = useState<SiteInput>(site ? { ...site } : { name: '', url: 'https://', enabled: true, script: null, browserProfileId: profiles[0]?.id ?? '', timeoutMs: defaultTimeoutMs, schedule: { enabled: false, cron: '0 9 * * *' } });
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null);
  const configure: BeforeMount = (monaco) => {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      interface AutomationLogger { info(message: string): void; warn(message: string): void; error(message: string): void; }
      interface Locator { click(options?: { timeout?: number }): Promise<void>; isVisible(): Promise<boolean>; fill(value: string): Promise<void>; }
      interface Page { url(): string; getByRole(role: string, options?: { name?: string }): Locator; getByText(text: string): Locator; getByLabel(text: string): Locator; locator(selector: string): Locator; waitForTimeout(ms: number): Promise<void>; }
      interface AutomationContext { page: Page; log: AutomationLogger; config: Record<string, unknown>; }
    `, 'ts:site-runner/automation.d.ts');
  };
  async function save(event: { preventDefault(): void }, runAfter = false) {
    event.preventDefault(); setSaving(true);
    try { const saved = await window.siteRunner.sites.save(form); await onSaved(saved, runAfter); } catch (error) { onError(error); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="editor-modal" onSubmit={(event) => void save(event)}><div className="modal-head"><div><span className="eyebrow">{site ? 'EDIT SITE' : 'NEW SITE'}</span><h2>{site?.name ?? 'Create an automation'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><div className="form-grid"><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>URL<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required /></label><label>Browser profile<select value={form.browserProfileId} onChange={(event) => setForm({ ...form, browserProfileId: event.target.value })}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>Timeout (ms)<input type="number" min="1000" max="300000" value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })} /></label><label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label><label className="checkbox"><input type="checkbox" checked={form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, enabled: event.target.checked } })} /> Schedule</label><label className="span-2">Cron expression<input value={form.schedule.cron} disabled={!form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, cron: event.target.value } })} /></label></div><div className="editor-toolbar"><div><strong>Automation script</strong><small>Optional · trusted local TypeScript</small></div><div><button type="button" className="text-button" onClick={() => setForm({ ...form, script: template })}>Use template</button><button type="button" className="text-button" onClick={() => void editor?.getAction('editor.action.formatDocument')?.run()}>Format</button></div></div><div className="monaco-frame"><Editor height="290px" language="typescript" theme="vs-dark" value={form.script ?? ''} beforeMount={configure} onMount={(instance) => setEditor(instance)} onChange={(value) => setForm({ ...form, script: value || null })} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} /></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="button" className="secondary" disabled={saving} onClick={(event) => void save(event, true)}>{saving ? 'Running…' : 'Save & run'}</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save site'}</button></div></form></div>;
}

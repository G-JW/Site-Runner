import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { typescriptDefaults } from 'monaco-editor/languages/features/typescript/register.js';
import { useEffect, useMemo, useState } from 'react';
import type { BrowserProfile, RunLogEntry, Site, SiteInput } from '../../shared/types';
import { PageHeader } from '../App';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useI18n } from '../i18n';

const template = `export default async function run({ page, log, config }: AutomationContext) {
  log.info('Checking site state');
  // Example: await page.getByRole('button', { name: '签到' }).click();
}`;

export function SitesPage({ sites, profiles, onChange, onError }: { sites: Site[]; profiles: BrowserProfile[]; onChange(): Promise<void>; onError(error: unknown): void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(30_000);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const profileNames = useMemo(() => Object.fromEntries(profiles.map((item) => [item.id, item.name])), [profiles]);
  useEffect(() => window.siteRunner.runs.onLog((entry) => setLogs((current) => [...current.slice(-199), entry])), []);
  useEffect(() => {
    queueMicrotask(() => void window.siteRunner.settings.get().then((settings) => setDefaultTimeoutMs(settings.defaultTimeoutMs)).catch(onError));
  }, [onError]);
  async function toggle(site: Site) {
    try { await window.siteRunner.sites.save({ ...site, enabled: !site.enabled }); await onChange(); } catch (error) { onError(error); }
  }
  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try { await window.siteRunner.sites.remove(pendingDelete.id); setPendingDelete(null); await onChange(); }
    catch (error) { onError(error); } finally { setDeleting(false); }
  }
  async function run(site: Site) {
    setRunning((current) => new Set(current).add(site.id));
    setLogs((current) => [...current, { siteId: site.id, level: 'info', message: t('sites.starting', { name: site.name }), timestamp: new Date().toISOString() }]);
    try { await window.siteRunner.runs.runSite(site.id); await onChange(); } catch (error) { onError(error); }
    finally { setRunning((current) => { const next = new Set(current); next.delete(site.id); return next; }); }
  }
  return <><PageHeader eyebrow={t('sites.eyebrow')} title={t('sites.title')} description={t('sites.description')} actions={<button data-testid="add-site" className="primary" disabled={profiles.length === 0} onClick={() => setEditing('new')}>{t('sites.add')}</button>} />
    {profiles.length === 0 && <div className="callout">{t('sites.needProfile')}</div>}
    <section className="panel table-panel sites-table"><div className="table-head"><span>{t('sites.site')}</span><span>{t('sites.profile')}</span><span>{t('sites.schedule')}</span><span>{t('sites.lastRun')}</span><span>{t('sites.actions')}</span></div>
      {sites.length === 0 ? <div className="table-empty">{t('sites.empty')}</div> : sites.map((site) => <div className="table-row" key={site.id}><div className="site-cell"><button className={`toggle ${site.enabled ? 'on' : ''}`} aria-label={`${site.enabled ? t('common.enabled') : t('common.disabled')} ${site.name}`} onClick={() => void toggle(site)}><span /></button><div><strong>{site.name}</strong><small>{site.url}</small></div></div><span>{profileNames[site.browserProfileId] ?? t('common.unknown')}</span><span>{site.schedule.enabled ? site.schedule.cron : t('sites.off')}</span><span><i className={`result-dot ${site.lastRun?.status ?? 'idle'}`} />{running.has(site.id) ? t('common.running') : (site.lastRun ? t(`common.${site.lastRun.status}`) : t('common.notRun'))}</span><div className="row-actions"><button disabled={running.has(site.id)} onClick={() => void run(site)}>{t('sites.run')}</button><button onClick={() => setEditing(site)}>{t('common.edit')}</button><button className="danger-ghost" onClick={() => setPendingDelete(site)}>{t('common.delete')}</button></div></div>)}</section>
    {logs.length > 0 && <section className="panel log-panel"><div className="panel-heading"><div><span className="eyebrow">{t('sites.liveOutput')}</span><h2>{t('sites.runLog')}</h2></div><button className="text-button" onClick={() => setLogs([])}>{t('sites.clear')}</button></div><div className="log-lines">{logs.map((entry, index) => <div className={entry.level} key={`${entry.timestamp}-${index}`}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><span>{entry.level}</span><p>{entry.message}</p></div>)}</div></section>}
    {editing && <SiteEditor site={editing === 'new' ? null : editing} profiles={profiles} defaultTimeoutMs={defaultTimeoutMs} onClose={() => setEditing(null)} onSaved={async (saved, runAfter) => { setEditing(null); await onChange(); if (runAfter) await run(saved); }} onError={onError} />}
    {pendingDelete && <ConfirmDialog title={t('sites.deleteQuestion', { name: pendingDelete.name })} description={t('sites.deleteDescription')} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
  </>;
}

function SiteEditor({ site, profiles, defaultTimeoutMs, onClose, onSaved, onError }: { site: Site | null; profiles: BrowserProfile[]; defaultTimeoutMs: number; onClose(): void; onSaved(site: Site, runAfter: boolean): Promise<void>; onError(error: unknown): void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<SiteInput>(site ? { ...site } : { name: '', url: 'https://', enabled: true, script: null, browserProfileId: profiles[0]?.id ?? '', timeoutMs: defaultTimeoutMs, schedule: { enabled: false, cron: '0 9 * * *' } });
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null);
  const configure: BeforeMount = () => {
    typescriptDefaults.addExtraLib(`
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
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form data-testid="site-dialog" className="editor-modal" onSubmit={(event) => void save(event)}><div className="modal-head"><div><span className="eyebrow">{site ? t('editor.edit') : t('editor.new')}</span><h2>{site?.name ?? t('editor.create')}</h2></div><button type="button" aria-label={t('common.close')} className="close" onClick={onClose}>×</button></div><div className="form-grid"><label>{t('editor.name')}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>{t('editor.url')}<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required /></label><label>{t('editor.profile')}<select value={form.browserProfileId} onChange={(event) => setForm({ ...form, browserProfileId: event.target.value })}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>{t('editor.timeout')}<input type="number" min="1000" max="300000" value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })} /></label><label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> {t('editor.enabled')}</label><label className="checkbox"><input type="checkbox" checked={form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, enabled: event.target.checked } })} /> {t('editor.schedule')}</label><label className="span-2">{t('editor.cron')}<input value={form.schedule.cron} disabled={!form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, cron: event.target.value } })} /></label></div><div className="editor-toolbar"><div><strong>{t('editor.script')}</strong><small>{t('editor.scriptHint')}</small></div><div><button type="button" className="text-button" onClick={() => setForm({ ...form, script: template })}>{t('editor.template')}</button><button type="button" className="text-button" onClick={() => void editor?.getAction('editor.action.formatDocument')?.run()}>{t('editor.format')}</button></div></div><div className="monaco-frame"><Editor height="290px" language="typescript" theme="vs-dark" value={form.script ?? ''} beforeMount={configure} onMount={(instance) => setEditor(instance)} onChange={(value) => setForm({ ...form, script: value || null })} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} /></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t('common.cancel')}</button><button type="button" className="secondary" disabled={saving} onClick={(event) => void save(event, true)}>{saving ? t('common.running') : t('editor.saveRun')}</button><button className="primary" disabled={saving}>{saving ? t('editor.saving') : t('editor.saveSite')}</button></div></form></div>;
}

import { defaultVisitOptions } from '../../shared/visit-options';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { typescriptDefaults } from 'monaco-editor/languages/features/typescript/register.js';
import { useEffect, useMemo, useState } from 'react';
import type { BrowserProfile, RunLogEntry, Site, SiteInput, ScriptTemplate, SiteRule, SiteFolder, RuntimeSnapshot } from '../../shared/types';
import { PageHeader } from '../App';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FolderPanel } from '../components/FolderPanel';
import { SiteRulesDialog } from '../components/SiteRulesDialog';
import { useI18n } from '../i18n';

export function SitesPage({ runtime, busy, logs, onClearLogs, folders, sites, profiles, templates, initialTemplate, onTemplateConsumed, onChange, onError }: { runtime: RuntimeSnapshot; busy: Set<string>; logs: RunLogEntry[]; onClearLogs(): void; folders: SiteFolder[]; sites: Site[]; profiles: BrowserProfile[]; templates: ScriptTemplate[]; initialTemplate: ScriptTemplate | null; onTemplateConsumed(): void; onChange(): Promise<void>; onError(error: unknown): void }) {
  const { language, t } = useI18n();
  const [editing, setEditing] = useState<Site | 'new' | null>(initialTemplate ? 'new' : null);
  const [draftScript] = useState(initialTemplate?.script ?? null);
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const running = new Set([...starting, ...busy]);
  const [logSiteId, setLogSiteId] = useState('');
  const visibleLogs = logSiteId ? logs.filter((entry) => entry.siteId === logSiteId) : logs;
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(30_000);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importRules, setImportRules] = useState<SiteRule[] | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [folderId, setFolderId] = useState('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const activeFolder = folderId === 'all' || folderId === 'ungrouped' || folders.some((item) => item.id === folderId) ? folderId : 'all';
  const visibleSites = sites.filter((site) => {
    const inFolder = activeFolder === 'all' || (activeFolder === 'ungrouped' ? !site.folderId : site.folderId === activeFolder);
    const matchesSearch = `${site.name} ${site.url}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = filter === 'all' || (filter === 'enabled' ? site.enabled : filter === 'disabled' ? !site.enabled : filter === 'active' ? running.has(site.id) : filter === 'notRun' ? !site.lastRun : site.lastRun?.status === filter);
    return inFolder && matchesSearch && matchesStatus;
  }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, language) : sort === 'recent' ? (b.lastRun ? Date.parse(b.lastRun.finishedAt) : 0) - (a.lastRun ? Date.parse(a.lastRun.finishedAt) : 0) : 0);
  const selectedIds = visibleSites.filter((site) => selected.has(site.id)).map((site) => site.id);
  const enabledIds = visibleSites.filter((site) => site.enabled).map((site) => site.id);
  const selectedRunIds = visibleSites.filter((site) => site.enabled && selected.has(site.id)).map((site) => site.id);
  const failedIds = visibleSites.filter((site) => site.enabled && site.lastRun?.status === 'failed').map((site) => site.id);
  const cannotRun = (ids: string[]) => !ids.length || batchRunning || runtime.batches.length > 0 || ids.some((id) => running.has(id));
  function selectFolder(id: string) { setFolderId(id); setSelected(new Set()); }
  async function move(target: string) {
    if (!selectedIds.length) return; setMoving(true);
    try { await window.siteRunner.folders.moveSites(selectedIds, target || null); await onChange(); setSelected(new Set()); }
    catch (error) { onError(error); } finally { setMoving(false); }
  }
  async function runView(ids: string[]) {
    if (!ids.length) return; setBatchRunning(true);
    try { await window.siteRunner.runs.runSites(ids); await onChange(); }
    catch (error) { onError(error); } finally { setBatchRunning(false); }
  }
  async function loadImport() {
    setLoadingImport(true);
    try { const rules = await window.siteRunner.sites.previewImport(); if (rules) setImportRules(rules); }
    catch (error) { onError(error); } finally { setLoadingImport(false); }
  }
  const profileNames = useMemo(() => Object.fromEntries(profiles.map((item) => [item.id, item.name])), [profiles]);
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
    setStarting((current) => new Set(current).add(site.id));
    try { await window.siteRunner.runs.runSite(site.id); await onChange(); } catch (error) { onError(error); }
    finally { setStarting((current) => { const next = new Set(current); next.delete(site.id); return next; }); }
  }
  return <><PageHeader eyebrow={t('sites.eyebrow')} title={t('sites.title')} description={t('sites.description')} actions={<><button data-testid="export-rules" className="secondary" disabled={sites.length === 0} onClick={() => setExporting(true)}>{t('rules.export')}</button><button data-testid="import-rules" className="secondary" disabled={loadingImport || profiles.length === 0} onClick={() => void loadImport()}>{t('rules.import')}</button><button data-testid="add-site" className="primary" disabled={profiles.length === 0} onClick={() => setEditing('new')}>{t('sites.add')}</button></>} />
    {profiles.length === 0 && <div className="callout">{t('sites.needProfile')}</div>}
    <div className="sites-layout"><FolderPanel folders={folders} sites={sites} selected={activeFolder} onSelect={selectFolder} onChange={onChange} onError={onError} /><div className="sites-content">
    <div className="sites-tools"><input data-testid="site-search" aria-label={t('folders.search')} placeholder={t('folders.search')} value={search} onChange={(event) => { setSearch(event.target.value); setSelected(new Set()); }} /><select data-testid="site-status-filter" aria-label={t('sites.filter')} value={filter} onChange={(event) => { setFilter(event.target.value); setSelected(new Set()); }}>{(['all', 'enabled', 'disabled', 'success', 'failed', 'notRun', 'active'] as const).map((value) => <option key={value} value={value}>{t(`sites.filter.${value}`)}</option>)}</select><select data-testid="site-sort" aria-label={t('sites.sort')} value={sort} onChange={(event) => setSort(event.target.value)}>{(['default', 'name', 'recent'] as const).map((value) => <option key={value} value={value}>{t(`sites.sort.${value}`)}</option>)}</select><button data-testid="run-folder" className="secondary" disabled={cannotRun(enabledIds)} onClick={() => void runView(enabledIds)}>{t('folders.run')}</button></div>
    <div className="site-selection"><label className="checkbox"><input data-testid="select-all-sites" type="checkbox" disabled={!visibleSites.length || moving} checked={visibleSites.length > 0 && selectedIds.length === visibleSites.length} onChange={(event) => setSelected(event.target.checked ? new Set(visibleSites.map((site) => site.id)) : new Set())} />{t('folders.selectAll')}</label><span>{t('folders.selected', { count: selectedIds.length })}</span><button data-testid="run-selected-sites" className="secondary" disabled={cannotRun(selectedRunIds)} onClick={() => void runView(selectedRunIds)}>{t('sites.runSelected', { count: selectedRunIds.length })}</button><button data-testid="retry-failed-sites" className="secondary" disabled={cannotRun(failedIds)} onClick={() => void runView(failedIds)}>{t('sites.retryFailed', { count: failedIds.length })}</button><label>{t('folders.move')}<select data-testid="move-sites" value="" disabled={moving || !selectedIds.length} onChange={(event) => void move(event.target.value === 'ungrouped' ? '' : event.target.value)}><option value="" disabled>{t('folders.move')}</option><option value="ungrouped">{t('folders.ungrouped')}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></div>
    <p className="sites-view-note">{t('sites.viewNote', { visible: visibleSites.length, total: sites.length })}</p>
    <section className="panel table-panel sites-table"><div className="table-head"><span>{t('sites.site')}</span><span>{t('sites.profile')}</span><span>{t('sites.schedule')}</span><span>{t('sites.lastRun')}</span><span>{t('sites.actions')}</span></div>
      {visibleSites.length === 0 ? <div className="table-empty">{t('folders.empty')}</div> : visibleSites.map((site) => <div className="table-row" data-testid={`site-row-${site.id}`} key={site.id}><div className="site-cell"><input type="checkbox" aria-label={site.name} checked={selected.has(site.id)} disabled={moving} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(site.id); else next.delete(site.id); return next; })} /><button className={`toggle ${site.enabled ? 'on' : ''}`} disabled={running.has(site.id)} aria-label={`${site.enabled ? t('common.enabled') : t('common.disabled')} ${site.name}`} onClick={() => void toggle(site)}><span /></button><div><strong>{site.name}</strong><small>{site.url}</small><small className="site-folder-label">{folders.find((folder) => folder.id === site.folderId)?.name ?? t('folders.ungrouped')}</small></div></div><span>{profileNames[site.browserProfileId] ?? t('common.unknown')}</span><span>{site.schedule.enabled ? site.schedule.cron : t('sites.off')}</span><span><i className={`result-dot ${site.lastRun?.status ?? 'idle'}`} />{running.has(site.id) ? t(runtime.runs.find((run) => run.siteId === site.id)?.phase === 'running' ? 'common.running' : 'runtime.queued') : (site.lastRun ? t(`common.${site.lastRun.status}`) : t('common.notRun'))}</span><div className="row-actions"><button disabled={running.has(site.id)} onClick={() => void run(site)}>{t('sites.run')}</button><button disabled={running.has(site.id)} onClick={() => setEditing(site)}>{t('common.edit')}</button><button className="danger-ghost" disabled={running.has(site.id)} onClick={() => setPendingDelete(site)}>{t('common.delete')}</button></div></div>)}</section>
    </div></div>
    {logs.length > 0 && <section className="panel log-panel"><div className="panel-heading"><div><span className="eyebrow">{t('sites.liveOutput')}</span><h2>{t('sites.runLog')}</h2></div><button className="text-button" onClick={onClearLogs}>{t('sites.clear')}</button></div><select data-testid="log-site-filter" aria-label={t('history.filter')} value={logSiteId} onChange={(event) => setLogSiteId(event.target.value)}><option value="">{t('history.allSites')}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select><div className="log-lines">{visibleLogs.map((entry, index) => <div className={entry.level} key={`${entry.timestamp}-${index}`}><time>{new Date(entry.timestamp).toLocaleTimeString()}</time><span>{entry.level}</span><p><strong>{sites.find((site) => site.id === entry.siteId)?.name ?? t('common.unknown')}: </strong>{entry.message}</p></div>)}</div></section>}
    {editing && <SiteEditor folders={folders} defaultFolderId={folders.some((item) => item.id === activeFolder) ? activeFolder : null} templates={templates} site={editing === 'new' ? null : editing} profiles={profiles} defaultTimeoutMs={defaultTimeoutMs} initialScript={initialTemplate ? draftScript : null} onClose={() => { setEditing(null); onTemplateConsumed(); }} onSaved={async (saved, runAfter) => { setEditing(null); onTemplateConsumed(); await onChange(); if (runAfter) await run(saved); }} onError={onError} />}
    {(exporting || importRules) && <SiteRulesDialog sites={sites} profiles={profiles} rules={importRules} onClose={() => { setExporting(false); setImportRules(null); }} onChange={onChange} onError={onError} />}
    {pendingDelete && <ConfirmDialog title={t('sites.deleteQuestion', { name: pendingDelete.name })} description={t('sites.deleteDescription')} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
  </>;
}

function SiteEditor({ folders, defaultFolderId, site, profiles, templates, defaultTimeoutMs, initialScript, onClose, onSaved, onError }: { folders: SiteFolder[]; defaultFolderId: string | null; site: Site | null; profiles: BrowserProfile[]; templates: ScriptTemplate[]; defaultTimeoutMs: number; initialScript: string | null; onClose(): void; onSaved(site: Site, runAfter: boolean): Promise<void>; onError(error: unknown): void }) {
  const { language, t } = useI18n();
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '');
  const [replacePending, setReplacePending] = useState(false);
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const [form, setForm] = useState<SiteInput>(site ? { ...site } : { visitOptions: { ...defaultVisitOptions }, folderId: defaultFolderId, name: '', url: 'https://', enabled: true, script: initialScript, browserProfileId: profiles[0]?.id ?? '', timeoutMs: defaultTimeoutMs, schedule: { enabled: false, cron: '0 9 * * *' } });
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null);
  const configure: BeforeMount = () => {
    typescriptDefaults.addExtraLib(`
      interface AutomationLogger { info(message: string): void; warn(message: string): void; error(message: string): void; }
      interface Locator { click(options?: { timeout?: number }): Promise<void>; isVisible(): Promise<boolean>; fill(value: string): Promise<void>; waitFor(options: { state: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<void>; getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator; or(other: Locator): Locator; first(): Locator; }
      interface BrowserContext { newPage(): Promise<Page>; pages(): Page[]; }
      interface Page { url(): string; context(): BrowserContext; waitForEvent(event: 'popup'): Promise<Page>; getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator; getByText(text: string, options?: { exact?: boolean }): Locator; getByLabel(text: string, options?: { exact?: boolean }): Locator; locator(selector: string): Locator; waitForTimeout(ms: number): Promise<void>; }
      interface AutomationContext { page: Page; log: AutomationLogger; config: Record<string, unknown>; expect: (value: unknown) => any; }
    `, 'ts:site-runner/automation.d.ts');
  };
  async function save(event: { preventDefault(): void }, runAfter = false) {
    event.preventDefault(); setSaving(true);
    try { const saved = await window.siteRunner.sites.save(form); await onSaved(saved, runAfter); } catch (error) { onError(error); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form data-testid="site-dialog" className="editor-modal site-editor" onSubmit={(event) => void save(event)}><div className="modal-head"><div><span className="eyebrow">{site ? t('editor.edit') : t('editor.new')}</span><h2>{site?.name ?? t('editor.create')}</h2></div><button type="button" aria-label={t('common.close')} className="close" onClick={onClose}>×</button></div><div className="site-editor-body"><div className="form-grid"><label>{t('editor.name')}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>{t('editor.url')}<input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required /></label><label>{t('editor.profile')}<select value={form.browserProfileId} onChange={(event) => setForm({ ...form, browserProfileId: event.target.value })}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label>{t('editor.timeout')}<input type="number" min="1000" max="300000" value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })} /></label>{!form.script?.trim() && <div className="span-2 visit-controls"><strong>{t('visit.title')}</strong><div className="visit-fields"><label>{t('visit.stay')}<input data-testid="visit-stay" type="number" min="0" max="60000" value={(form.visitOptions ?? defaultVisitOptions).stayMs} onChange={(event) => setForm({ ...form, visitOptions: { ...(form.visitOptions ?? defaultVisitOptions), stayMs: Number(event.target.value) } })} /></label><label>{t('visit.check')}<select data-testid="visit-check" value={(form.visitOptions ?? defaultVisitOptions).check} onChange={(event) => setForm({ ...form, visitOptions: { ...(form.visitOptions ?? defaultVisitOptions), check: event.target.value as 'none' | 'selector' | 'text' } })}><option value="none">{t('visit.none')}</option><option value="selector">{t('visit.selector')}</option><option value="text">{t('visit.text')}</option></select></label></div>{form.visitOptions?.check !== 'none' && form.visitOptions?.check && <label>{t('visit.value')}<input data-testid="visit-value" required value={form.visitOptions.value} onChange={(event) => setForm({ ...form, visitOptions: { ...form.visitOptions!, value: event.target.value } })} /></label>}<label className="checkbox"><input type="checkbox" checked={(form.visitOptions ?? defaultVisitOptions).detectChallenges} onChange={(event) => setForm({ ...form, visitOptions: { ...(form.visitOptions ?? defaultVisitOptions), detectChallenges: event.target.checked } })} />{t('visit.detect')}</label><small>{t('visit.note')}</small></div>}<label className="span-2">{t('folders.title')}<select data-testid="site-folder" value={form.folderId ?? ''} onChange={(event) => setForm({ ...form, folderId: event.target.value || null })}><option value="">{t('folders.ungrouped')}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> {t('editor.enabled')}</label><div className="schedule-row"><label className="checkbox"><input type="checkbox" checked={form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, enabled: event.target.checked } })} /> {t('editor.schedule')}</label><label className="cron-field">{t('editor.cron')}<input value={form.schedule.cron} disabled={!form.schedule.enabled} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, cron: event.target.value } })} /></label></div></div><div className="editor-toolbar"><div><strong>{t('editor.script')}</strong><small>{t('editor.scriptHint')}</small></div><div><button type="button" className="text-button" data-testid="choose-template" disabled={templates.length === 0} onClick={() => { setShowTemplates(!showTemplates); setReplacePending(false); }}>{t('templates.choose')}</button><button type="button" className="text-button" onClick={() => void editor?.getAction('editor.action.formatDocument')?.run()}>{t('editor.format')}</button></div></div>{showTemplates && selectedTemplate && <section className="template-picker"><select data-testid="template-select" aria-label={t('templates.choose')} value={selectedTemplate.id} onChange={(event) => { setSelectedTemplateId(event.target.value); setReplacePending(false); }}>{templates.map((item) => <option key={item.id} value={item.id}>{item.name[language]}</option>)}</select><p>{selectedTemplate.instructions[language]}</p>{replacePending && <p role="alert">{t('templates.replace')}</p>}<div><button data-testid="apply-template" type="button" className="secondary" onClick={() => { if (form.script?.trim() && !replacePending) { setReplacePending(true); return; } setForm({ ...form, script: selectedTemplate.script }); setShowTemplates(false); setReplacePending(false); }}>{t(replacePending ? 'templates.confirm' : 'templates.apply')}</button>{replacePending && <button type="button" className="text-button" onClick={() => setReplacePending(false)}>{t('common.cancel')}</button>}</div></section>}<div className="monaco-frame"><Editor height="clamp(160px, 32vh, 290px)" language="typescript" theme="vs-dark" value={form.script ?? ''} beforeMount={configure} onMount={(instance) => setEditor(instance)} onChange={(value) => setForm({ ...form, script: value || null })} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} /></div></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t('common.cancel')}</button><button type="button" className="secondary" disabled={saving} onClick={(event) => void save(event, true)}>{saving ? t('common.running') : t('editor.saveRun')}</button><button className="primary" disabled={saving}>{saving ? t('editor.saving') : t('editor.saveSite')}</button></div></form></div>;
}

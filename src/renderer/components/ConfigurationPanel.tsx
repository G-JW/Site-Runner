import { useState } from 'react';
import type { ConfigurationFile } from '../../shared/types';
import { useI18n } from '../i18n';
export function ConfigurationPanel({ onChange, onError }: { onChange(): Promise<void>; onError(error: unknown): void }) {
  const { t } = useI18n(); const [file, setFile] = useState<ConfigurationFile | null>(null);
  const [applySettings, setApplySettings] = useState(false), [busy, setBusy] = useState(false);
  async function preview() {
    setBusy(true); try { setFile(await window.siteRunner.settings.previewConfiguration()); setApplySettings(false); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function restore() {
    if (!file) return; setBusy(true);
    try { await window.siteRunner.settings.importConfiguration(file, applySettings); await onChange(); setFile(null); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <><section className="panel notification-history"><h2>{t('backup.title')}</h2><p>{t('backup.note')}</p><div className="template-actions"><button data-testid="export-configuration" className="secondary" disabled={busy} onClick={() => void window.siteRunner.settings.exportConfiguration().catch(onError)}>{t('backup.export')}</button><button data-testid="import-configuration" className="secondary" disabled={busy} onClick={() => void preview()}>{t('backup.import')}</button></div></section>
    {file && <div className="modal-backdrop"><section data-testid="configuration-dialog" className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="configuration-title"><div className="modal-head"><h2 id="configuration-title">{t('backup.import')}</h2><button className="close" disabled={busy} aria-label={t('common.close')} onClick={() => setFile(null)}>×</button></div><div className="rules-content"><p>{t('backup.restoreNote')}</p><p>{t('backup.count', { sites: file.sites.length, folders: file.folders.length, templates: file.templates.length })}</p><label className="checkbox"><input type="checkbox" checked={applySettings} onChange={(event) => setApplySettings(event.target.checked)} />{t('backup.settings')}</label>{file.sites.map((site, index) => <details key={index}><summary>{site.name}</summary><p>{site.url}</p><pre className="run-error">{site.script ?? t('templates.noScript')}</pre></details>)}{file.templates.map((template, index) => <details key={`template-${index}`}><summary>{template.name['zh-CN']} / {template.name.en}</summary><pre className="run-error">{template.script ?? t('templates.noScript')}</pre></details>)}</div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setFile(null)}>{t('common.cancel')}</button><button data-testid="confirm-configuration" className="primary" disabled={busy} onClick={() => void restore()}>{t('backup.confirm')}</button></div></section></div>}
  </>;
}

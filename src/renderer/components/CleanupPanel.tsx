import { useEffect, useState } from 'react';
import type { AppSettings, CleanupPolicy, CleanupPreview, CleanupReport, CleanupStatus } from '../../shared/types';
import { useI18n } from '../i18n';
import { ConfirmDialog } from './ConfirmDialog';

export function CleanupPanel({ settings, update, onChange, onError }: {
  settings: AppSettings; update(patch: Partial<AppSettings>): Promise<void>; onChange(): Promise<void>; onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<CleanupPolicy>(settings.cleanup);
  const [status, setStatus] = useState<CleanupStatus | null>(null);
  const [preview, setPreview] = useState<CleanupPreview | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { queueMicrotask(() => { setPolicy(settings.cleanup); setPreview(null); }); }, [settings.cleanup]);
  useEffect(() => { queueMicrotask(() => void window.siteRunner.cleanup.status().then(setStatus).catch(onError)); }, [onError]);
  const summary = (report: CleanupReport) => t('cleanup.count', { runs: report.runs, receipts: report.receipts, screenshots: report.screenshots, backups: report.backups, mb: (report.bytes / 1048576).toFixed(2) });
  async function save() {
    setBusy(true); try { await update({ cleanup: policy }); } finally { setBusy(false); }
  }
  async function inspect() {
    setBusy(true); try { setPreview(await window.siteRunner.cleanup.preview()); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function execute() {
    if (!preview) return; setBusy(true);
    try { await window.siteRunner.cleanup.execute(preview.id); setPreview(null); setStatus(await window.siteRunner.cleanup.status()); await onChange(); }
    catch (error) { onError(error); setPreview(null); } finally { setBusy(false); }
  }
  const changed = JSON.stringify(policy) !== JSON.stringify(settings.cleanup);
  return <><section className="panel notification-history" data-testid="cleanup-panel"><h2>{t('cleanup.title')}</h2><p>{t('cleanup.note')}</p>
    <div className="form-grid"><label>{t('cleanup.historyDays')}<input data-testid="cleanup-history-days" type="number" min="1" max="3650" value={policy.historyDays} disabled={busy} onChange={(event) => setPolicy({ ...policy, historyDays: Number(event.target.value) })} /></label>
    <label>{t('cleanup.backupDays')}<input data-testid="cleanup-backup-days" type="number" min="1" max="3650" value={policy.backupDays} disabled={busy} onChange={(event) => setPolicy({ ...policy, backupDays: Number(event.target.value) })} /></label>
    <label className="checkbox"><input data-testid="cleanup-automatic" type="checkbox" checked={policy.automatic} disabled={busy} onChange={(event) => setPolicy({ ...policy, automatic: event.target.checked })} />{t('cleanup.automatic')}</label></div>
    <p>{t('cleanup.schedule')}</p><div className="template-actions"><button data-testid="cleanup-save" className="secondary" disabled={busy || !changed} onClick={() => void save()}>{t('cleanup.save')}</button><button data-testid="cleanup-preview" className="secondary" disabled={busy || changed} onClick={() => void inspect()}>{t('cleanup.preview')}</button></div>
    {changed && <p>{t('cleanup.unsaved')}</p>}{status && <div data-testid="cleanup-result" role="status"><p>{t('cleanup.last', { time: new Date(status.finishedAt).toLocaleString() })}</p><p>{summary(status.report)}</p>{status.report.errors.length > 0 && <><p>{t('cleanup.errors')}</p><pre className="run-error">{status.report.errors.join('\n')}</pre></>}</div>}
  </section>{preview && <ConfirmDialog title={t('cleanup.confirmTitle')} eyebrow={t('cleanup.preview')} description={summary(preview) + ' ' + t('cleanup.confirmNote')} confirmLabel={t('cleanup.confirm')} busy={busy} onCancel={() => setPreview(null)} onConfirm={() => void execute()} />}</>;
}

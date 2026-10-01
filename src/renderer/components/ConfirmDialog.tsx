import { useI18n } from '../i18n';

export function ConfirmDialog({ title, description, busy = false, onCancel, onConfirm }: {
  title: string; description: string; busy?: boolean; onCancel(): void; onConfirm(): void;
}) {
  const { t } = useI18n();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal-head"><div><span className="eyebrow">{t('common.confirmDelete')}</span><h2 id="confirm-title">{title}</h2></div><button type="button" aria-label={t('common.close')} className="close" disabled={busy} onClick={onCancel}>×</button></div>
      <p>{description}</p>
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button><button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{t('common.delete')}</button></div>
    </section>
  </div>;
}

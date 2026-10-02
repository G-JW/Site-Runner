import { useI18n } from '../i18n';

export function ConfirmDialog({ title, description, busy = false, confirmLabel, eyebrow, onCancel, onConfirm }: {
  title: string; description: string; busy?: boolean; confirmLabel?: string; eyebrow?: string; onCancel(): void; onConfirm(): void;
}) {
  const { t } = useI18n();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal-head"><div><span className="eyebrow">{eyebrow ?? t('common.confirmDelete')}</span><h2 id="confirm-title">{title}</h2></div><button type="button" aria-label={t('common.close')} className="close" disabled={busy} onClick={onCancel}>×</button></div>
      <p>{description}</p>
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button><button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{confirmLabel ?? t('common.delete')}</button></div>
    </section>
  </div>;
}

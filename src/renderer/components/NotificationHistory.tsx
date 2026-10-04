import { useEffect, useState } from 'react';
import type { NotificationReceipt } from '../../shared/types';
import { useI18n } from '../i18n';
export function NotificationHistory({ revision = 0, onError }: { revision?: number; onError(error: unknown): void }) {
  const { t, language } = useI18n(); const [receipts, setReceipts] = useState<NotificationReceipt[]>([]);
  useEffect(() => {
    let disposed = false;
    const update = () => void window.siteRunner.notifications.receipts().then((next) => { if (!disposed) setReceipts(next); }).catch(onError);
    update(); const timer = setInterval(update, 5000); return () => { disposed = true; clearInterval(timer); };
  }, [onError, revision]);
  return <section className="panel notification-history"><h2>{t('notifications.delivery')}</h2><p>{t('notifications.deliveryNote')}</p>{!receipts.length ? <p>{t('history.empty')}</p> : receipts.map((receipt) => <div className="receipt-row" key={receipt.id}><span><i className={`result-dot ${receipt.success ? 'success' : 'failed'}`} />{t(receipt.success ? 'common.success' : 'common.failed')}</span><strong>{receipt.channelName}</strong><span>{new Date(receipt.createdAt).toLocaleString(language)}</span><p>{receipt.error ?? receipt.title}</p></div>)}</section>;
}

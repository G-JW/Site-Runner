import { useCallback, useEffect, useState } from 'react';
import { NotificationHistory } from '../components/NotificationHistory';
import type { NotificationChannel, NotificationChannelInput, ProviderType } from '../../shared/types';
import { PageHeader } from '../App';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useI18n } from '../i18n';

export function NotificationsPage({ onError }: { onError(error: unknown): void }) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editing, setEditing] = useState<NotificationChannel | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NotificationChannel | null>(null);
  const [feedback, setFeedback] = useState('');
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(() => window.siteRunner.notifications.list().then(setChannels), []);
  useEffect(() => { queueMicrotask(() => void load().catch(onError)); }, [load, onError]);
  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try { await window.siteRunner.notifications.remove(pendingDelete.id); setPendingDelete(null); await load(); }
    catch (error) { onError(error); } finally { setDeleting(false); }
  }
  async function test(channel: NotificationChannel) {
    try { await window.siteRunner.notifications.test(channel.id); setFeedback(t('notifications.sent')); }
    catch (error) { onError(error); }
  }
  return <><PageHeader eyebrow={t('notifications.eyebrow')} title={t('notifications.title')} description={t('notifications.description')} actions={<button className="primary" onClick={() => setEditing('new')}>{t('notifications.add')}</button>} />
    <NotificationHistory onError={onError} />
    {feedback && <div className="success-callout" role="status">{feedback}<button aria-label={t('common.close')} onClick={() => setFeedback('')}>×</button></div>}
    <section className="card-grid">{channels.length === 0 ? <div className="panel empty-state compact"><div className="empty-icon">◇</div><h2>{t('notifications.emptyTitle')}</h2><p>{t('notifications.emptyDescription')}</p></div> : channels.map((channel) => <article className="panel profile-card" key={channel.id}><span className="profile-glyph">◇</span><div><h2>{channel.name}</h2><p>{channel.providerType.toUpperCase()} · {t('notifications.events', { policy: t(`channel.${channel.eventPolicy}`) })} · {channel.enabled ? t('common.enabled') : t('common.disabled')}</p></div><div className="card-actions"><div><button className="text-button" onClick={() => void test(channel)}>{t('common.test')}</button><button className="text-button" onClick={() => setEditing(channel)}>{t('common.edit')}</button></div><button className="danger-ghost" onClick={() => setPendingDelete(channel)}>{t('common.delete')}</button></div></article>)}</section>
    {editing && <ChannelEditor channel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} onError={onError} />}
    {pendingDelete && <ConfirmDialog title={t('notifications.deleteQuestion', { name: pendingDelete.name })} description={t('notifications.deleteDescription')} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
  </>;
}

function ChannelEditor({ channel, onClose, onSaved, onError }: { channel: NotificationChannel | null; onClose(): void; onSaved(): Promise<void>; onError(error: unknown): void }) {
  const { t } = useI18n();
  const initialType: ProviderType = channel?.providerType ?? 'ntfy';
  const [form, setForm] = useState<NotificationChannelInput>(channel ? { ...channel } : {
    name: '', providerType: initialType, enabled: true, eventPolicy: 'all',
    config: initialType === 'ntfy' ? { serverUrl: 'https://ntfy.sh', topic: '', token: '' } : { url: '', method: 'POST', headers: {} },
  });
  const [headers, setHeaders] = useState(() => JSON.stringify(form.config.headers ?? {}, null, 2));
  function changeProvider(providerType: ProviderType) {
    setForm({ ...form, providerType, config: providerType === 'ntfy' ? { serverUrl: 'https://ntfy.sh', topic: '', token: '' } : { url: '', method: 'POST', headers: {} } });
    setHeaders('{}');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const config = form.providerType === 'webhook' ? { ...form.config, headers: JSON.parse(headers) as Record<string, string> } : form.config;
      await window.siteRunner.notifications.save({ ...form, config }); await onSaved();
    } catch (error) { onError(error); }
  }
  return <div className="modal-backdrop"><form className="channel-modal" onSubmit={(event) => void save(event)}><div className="modal-head"><div><span className="eyebrow">{t('channel.eyebrow')}</span><h2>{channel ? t('channel.edit') : t('channel.add')}</h2></div><button type="button" aria-label={t('common.close')} className="close" onClick={onClose}>×</button></div><div className="form-grid"><label>{t('channel.name')}<input value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{t('channel.provider')}<select value={form.providerType} onChange={(event) => changeProvider(event.target.value as ProviderType)}><option value="ntfy">NTFY</option><option value="webhook">{t('channel.webhook')}</option></select></label><label>{t('channel.policy')}<select value={form.eventPolicy} onChange={(event) => setForm({ ...form, eventPolicy: event.target.value as NotificationChannelInput['eventPolicy'] })}><option value="all">{t('channel.all')}</option><option value="normal">{t('channel.normal')}</option><option value="alert">{t('channel.alert')}</option></select></label><label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> {t('common.enabled')}</label>{form.providerType === 'ntfy' ? <><label>{t('channel.server')}<input required value={String(form.config.serverUrl ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, serverUrl: event.target.value } })} /></label><label>{t('channel.topic')}<input required value={String(form.config.topic ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, topic: event.target.value } })} /></label><label className="span-2">{t('channel.token')}<input type="password" value={String(form.config.token ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, token: event.target.value } })} /></label></> : <><label className="span-2">{t('channel.url')}<input required value={String(form.config.url ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, url: event.target.value } })} /></label><label>{t('channel.method')}<select value={String(form.config.method ?? 'POST')} onChange={(event) => setForm({ ...form, config: { ...form.config, method: event.target.value } })}><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label className="span-2">{t('channel.headers')}<textarea rows={4} value={headers} onChange={(event) => setHeaders(event.target.value)} /></label></>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t('common.cancel')}</button><button className="primary">{t('channel.save')}</button></div></form></div>;
}

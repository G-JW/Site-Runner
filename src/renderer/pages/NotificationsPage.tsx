import { useCallback, useEffect, useState } from 'react';
import type { NotificationChannel, NotificationChannelInput, ProviderType } from '../../shared/types';
import { PageHeader } from '../App';

export function NotificationsPage({ onError }: { onError(error: unknown): void }) {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editing, setEditing] = useState<NotificationChannel | 'new' | null>(null);
  const load = useCallback(() => window.siteRunner.notifications.list().then(setChannels), []);
  useEffect(() => { queueMicrotask(() => void load().catch(onError)); }, [load, onError]);
  async function remove(channel: NotificationChannel) {
    if (!window.confirm(`Delete channel “${channel.name}”?`)) return;
    try { await window.siteRunner.notifications.remove(channel.id); await load(); } catch (error) { onError(error); }
  }
  async function test(channel: NotificationChannel) {
    try { await window.siteRunner.notifications.test(channel.id); window.alert('Test notification sent.'); } catch (error) { onError(error); }
  }
  return <><PageHeader eyebrow="DELIVERY ROUTES" title="Notifications" description="Send one batch summary to the channels that match its severity." actions={<button className="primary" onClick={() => setEditing('new')}>Add channel</button>} />
    <section className="card-grid">{channels.length === 0 ? <div className="panel empty-state compact"><div className="empty-icon">◇</div><h2>No channels configured</h2><p>Automation continues normally without notifications.</p></div> : channels.map((channel) => <article className="panel profile-card" key={channel.id}><span className="profile-glyph">◇</span><div><h2>{channel.name}</h2><p>{channel.providerType.toUpperCase()} · {channel.eventPolicy} events · {channel.enabled ? 'enabled' : 'disabled'}</p></div><div className="card-actions"><div><button className="text-button" onClick={() => void test(channel)}>Test</button><button className="text-button" onClick={() => setEditing(channel)}>Edit</button></div><button className="danger-ghost" onClick={() => void remove(channel)}>Delete</button></div></article>)}</section>
    {editing && <ChannelEditor channel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} onError={onError} />}
  </>;
}

function ChannelEditor({ channel, onClose, onSaved, onError }: { channel: NotificationChannel | null; onClose(): void; onSaved(): Promise<void>; onError(error: unknown): void }) {
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
  return <div className="modal-backdrop"><form className="channel-modal" onSubmit={(event) => void save(event)}><div className="modal-head"><div><span className="eyebrow">NOTIFICATION CHANNEL</span><h2>{channel ? 'Edit channel' : 'Add a delivery route'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><div className="form-grid"><label>Name<input value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Provider<select value={form.providerType} onChange={(event) => changeProvider(event.target.value as ProviderType)}><option value="ntfy">NTFY</option><option value="webhook">Generic webhook</option></select></label><label>Event policy<select value={form.eventPolicy} onChange={(event) => setForm({ ...form, eventPolicy: event.target.value as NotificationChannelInput['eventPolicy'] })}><option value="all">All results</option><option value="normal">Normal only</option><option value="alert">Alerts only</option></select></label><label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label>{form.providerType === 'ntfy' ? <><label>Server URL<input required value={String(form.config.serverUrl ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, serverUrl: event.target.value } })} /></label><label>Topic<input required value={String(form.config.topic ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, topic: event.target.value } })} /></label><label className="span-2">Access token (optional)<input type="password" value={String(form.config.token ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, token: event.target.value } })} /></label></> : <><label className="span-2">Webhook URL<input required value={String(form.config.url ?? '')} onChange={(event) => setForm({ ...form, config: { ...form.config, url: event.target.value } })} /></label><label>Method<select value={String(form.config.method ?? 'POST')} onChange={(event) => setForm({ ...form, config: { ...form.config, method: event.target.value } })}><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label className="span-2">Headers (JSON)<textarea rows={4} value={headers} onChange={(event) => setHeaders(event.target.value)} /></label></>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save channel</button></div></form></div>;
}

import { useState } from 'react';
import type { BrowserProfile } from '../../shared/types';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useI18n } from '../i18n';
import { Icon } from '../workspace/Icon';

export function ProfilesPage({ busyProfiles, profiles, onChange, onError }: { busyProfiles: Set<string>; profiles: BrowserProfile[]; onChange(): Promise<void>; onError(error: unknown): void }) {
  const { language, t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrowserProfile | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await window.siteRunner.profiles.create(name);
      setCreating(false); setName(''); await onChange();
    } catch (error) { onError(error); } finally { setSaving(false); }
  }

  async function remove() {
    if (!pendingDelete) return;
    setSaving(true);
    try { await window.siteRunner.profiles.remove(pendingDelete.id); setPendingDelete(null); await onChange(); }
    catch (error) { onError(error); } finally { setSaving(false); }
  }

  return <><PageHeader eyebrow={t('profiles.eyebrow')} title={t('profiles.title')} description={t('profiles.description')} actions={<button data-testid="new-profile" className="primary" onClick={() => setCreating(true)}>{t('profiles.new')}</button>} />
    <section className="card-grid">{profiles.map((profile) => <article className="panel profile-card" key={profile.id}><span className="profile-glyph"><Icon name="profiles" /></span><div><h2>{profile.name}</h2><p>{t('profiles.created', { date: new Date(profile.createdAt).toLocaleDateString(language) })}</p></div><div className="card-actions"><button className="secondary" disabled={busyProfiles.has(profile.id)} onClick={() => void window.siteRunner.profiles.open(profile.id).catch(onError)}>{t('profiles.open')}</button><button className="danger-ghost" disabled={busyProfiles.has(profile.id)} onClick={() => setPendingDelete(profile)}>{t('common.delete')}</button></div></article>)}</section>
    {creating && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreating(false); }}><form data-testid="profile-dialog" className="small-modal" onSubmit={(event) => void create(event)}><div className="modal-head"><div><span className="eyebrow">{t('profiles.eyebrow')}</span><h2>{t('profiles.createTitle')}</h2><p>{t('profiles.createDescription')}</p></div><button type="button" aria-label={t('common.close')} className="close" disabled={saving} onClick={() => setCreating(false)}>×</button></div><div className="single-field"><label>{t('profiles.name')}<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setCreating(false)}>{t('common.cancel')}</button><button className="primary" disabled={saving || name.trim() === ''}>{saving ? t('profiles.creating') : t('profiles.create')}</button></div></form></div>}
    {pendingDelete && <ConfirmDialog title={t('profiles.deleteQuestion', { name: pendingDelete.name })} description={t('profiles.deleteDescription')} busy={saving} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />}
  </>;
}

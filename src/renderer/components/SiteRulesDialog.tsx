import { useState } from 'react';
import type { BrowserProfile, Site, SiteRule } from '../../shared/types';
import { useI18n } from '../i18n';

export function SiteRulesDialog({ sites, profiles, rules, onClose, onChange, onError }: {
  sites: Site[]; profiles: BrowserProfile[]; rules: SiteRule[] | null;
  onClose(): void; onChange(): Promise<void>; onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const importing = rules !== null;
  const items = rules ?? sites;
  const [selected, setSelected] = useState(new Set(items.map((_item, index) => index)));
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  async function submit(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true);
    try {
      if (rules) {
        await window.siteRunner.sites.importRules(rules.filter((_item, index) => selected.has(index)), profileId);
        await onChange(); onClose();
      } else {
        const saved = await window.siteRunner.sites.exportRules(sites.filter((_item, index) => selected.has(index)).map((item) => item.id));
        if (saved) onClose();
      }
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><form data-testid="rules-dialog" className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onSubmit={(event) => void submit(event)}>
    <div className="modal-head"><div><span className="eyebrow">{t(importing ? 'rules.import' : 'rules.export')}</span><h2 id="rules-title">{t(importing ? 'rules.preview' : 'rules.select')}</h2></div><button type="button" className="close" disabled={busy} onClick={onClose} aria-label={t('common.close')}>×</button></div>
    <div className="rules-content"><p>{t(importing ? 'rules.importNote' : 'rules.note')}</p>{importing && <label>{t('editor.profile')}<select data-testid="import-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
      {items.map((item, index) => <section className="rule-preview" key={index}><label className="checkbox"><input type="checkbox" checked={selected.has(index)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })} /><strong>{item.name}</strong></label><small>{item.url}</small>{importing && <details><summary>{t('editor.script')} · {item.schedule.cron}</summary><pre>{item.script ?? t('templates.noScript')}</pre></details>}</section>)}
    </div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button data-testid="confirm-rules" className="primary" disabled={busy || selected.size === 0 || (importing && !profileId)}>{busy ? t('editor.saving') : importing ? t('rules.count', { count: selected.size }) : t('rules.export')}</button></div>
  </form></div>;
}

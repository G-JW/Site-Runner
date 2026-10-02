import { useEffect, useState } from 'react';
import type { BrowserProfile, RecordingStatus } from '../../shared/types';
import { useI18n } from '../i18n';

export function RecorderPanel({ profiles, onRecorded, onError }: { profiles: BrowserProfile[]; onRecorded(script: string): void; onError(error: unknown): void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('https://');
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [status, setStatus] = useState<RecordingStatus>({ state: 'idle', error: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    const update = () => void window.siteRunner.recorder.status().then((next) => { if (!disposed) setStatus(next); }).catch((error: unknown) => { if (!disposed) onError(error); });
    update(); const timer = setInterval(update, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [onError]);
  async function act(action: 'start' | 'finish' | 'cancel') {
    setBusy(true);
    try {
      if (action === 'start') await window.siteRunner.recorder.start({ url, profileId: profileId || profiles[0]?.id || '' });
      else if (action === 'finish') onRecorded(await window.siteRunner.recorder.finish());
      else await window.siteRunner.recorder.cancel();
      setStatus(await window.siteRunner.recorder.status());
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const active = status.state === 'recording' || status.state === 'ready';
  return <section className="panel recorder-panel"><h2>{t('recorder.title')}</h2><p>{t('recorder.description')}</p><p className="recorder-note">{t('recorder.note')}</p><div className="recorder-inputs"><label>{t('editor.url')}<input data-testid="recording-url" value={url} disabled={active || busy} onChange={(event) => setUrl(event.target.value)} /></label><label>{t('editor.profile')}<select data-testid="recording-profile" value={profileId || profiles[0]?.id || ''} disabled={active || busy} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label></div><div className="template-actions"><button data-testid="start-recording" className="primary" disabled={busy || active || profiles.length === 0} onClick={() => void act('start')}>{t('recorder.start')}</button><button data-testid="finish-recording" className="secondary" disabled={busy || !active} onClick={() => void act('finish')}>{t('recorder.finish')}</button><button data-testid="cancel-recording" className="text-button" disabled={busy || !active} onClick={() => void act('cancel')}>{t('recorder.cancel')}</button><span data-testid="recording-status">{t(`recorder.${status.state}`)}</span></div>{status.error && <p role="alert">{status.error}</p>}</section>;
}

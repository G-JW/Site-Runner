import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings } from '../../shared/types';
import { PageHeader } from '../App';
import { useI18n } from '../i18n';

export function SettingsPage({ info, onError }: { info: AppInfo | null; onError(error: unknown): void }) {
  const { setLanguage, t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => { queueMicrotask(() => void window.siteRunner.settings.get().then(setSettings).catch(onError)); }, [onError]);
  async function update(patch: Partial<AppSettings>) {
    if (!settings) return;
    try {
      const next = await window.siteRunner.settings.update(patch);
      setSettings(next);
      if (patch.language) setLanguage(next.language);
    } catch (error) { onError(error); }
  }
  return <><PageHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} description={t('settings.description')} />
    {settings && <section className="panel settings-panel"><div className="setting-row"><div><strong>{t('settings.language')}</strong><p>{t('settings.languageDescription')}</p></div><select data-testid="language-select" value={settings.language} onChange={(event) => void update({ language: event.target.value as AppSettings['language'] })}><option value="en">{t('settings.english')}</option><option value="zh-CN">{t('settings.chinese')}</option></select></div><div className="setting-row"><div><strong>{t('settings.timeout')}</strong><p>{t('settings.timeoutDescription')}</p></div><input type="number" min="1000" max="300000" value={settings.defaultTimeoutMs} onChange={(event) => void update({ defaultTimeoutMs: Number(event.target.value) })} /></div><div className="setting-row"><div><strong>{t('settings.headless')}</strong><p>{t('settings.headlessDescription')}</p></div><label className="toggle-label"><input type="checkbox" checked={settings.browserHeadless} onChange={(event) => void update({ browserHeadless: event.target.checked })} /><span /></label></div><div className="setting-row"><div><strong>{t('settings.batchNotifications')}</strong><p>{t('settings.batchNotificationsDescription')}</p></div><label className="toggle-label"><input type="checkbox" checked={settings.notificationEnabled} onChange={(event) => void update({ notificationEnabled: event.target.checked })} /><span /></label></div><div className="setting-row"><div><strong>{t('settings.scheduledNotifications')}</strong><p>{t('settings.scheduledNotificationsDescription')}</p></div><label className="toggle-label"><input type="checkbox" checked={settings.notifyScheduledRuns} onChange={(event) => void update({ notifyScheduledRuns: event.target.checked })} /><span /></label></div><div className="setting-row path-row"><div><strong>{t('settings.localData')}</strong><p>{info?.userDataPath ?? t('common.loading')}</p></div></div></section>}
  </>;
}

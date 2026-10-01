import { useMemo, useState } from 'react';
import type { RunRecord, Site } from '../../shared/types';
import { PageHeader } from '../App';
import { useI18n } from '../i18n';

export function RunHistoryPage({ runs, sites, onError }: { runs: RunRecord[]; sites: Site[]; onError(error: unknown): void }) {
  const { language, t } = useI18n();
  const [siteId, setSiteId] = useState('');
  const visible = useMemo(() => siteId ? runs.filter((run) => run.siteId === siteId) : runs, [runs, siteId]);
  return <><PageHeader eyebrow={t('history.eyebrow')} title={t('history.title')} description={t('history.description')}
    actions={<select aria-label={t('history.filter')} value={siteId} onChange={(event) => setSiteId(event.target.value)}><option value="">{t('history.allSites')}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>} />
    <section className="panel table-panel"><div className="table-head"><span>{t('history.status')}</span><span>{t('history.site')}</span><span>{t('history.trigger')}</span><span>{t('history.finished')}</span><span>{t('history.details')}</span></div>
      {visible.length === 0 ? <div className="table-empty">{t('history.empty')}</div> : visible.map((run) => <div className="table-row" key={run.id}><span><i className={`result-dot ${run.status}`} />{t(`common.${run.status}`)}</span><strong>{run.siteName || sites.find((site) => site.id === run.siteId)?.name}</strong><span>{t(`history.trigger.${run.trigger}`)}</span><span>{new Date(run.finishedAt).toLocaleString(language)}</span><span className="run-details" title={run.error ?? run.message ?? ''}>{run.error ?? run.message ?? '—'}{run.screenshotPath && <button className="text-button" onClick={() => void window.siteRunner.runs.openScreenshot(run.id).catch(onError)}>{t('history.openScreenshot')}</button>}</span></div>)}</section>
  </>;
}

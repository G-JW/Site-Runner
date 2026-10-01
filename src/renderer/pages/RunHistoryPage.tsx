import { useMemo, useState } from 'react';
import type { RunRecord, Site } from '../../shared/types';
import { PageHeader } from '../App';

export function RunHistoryPage({ runs, sites, onError }: { runs: RunRecord[]; sites: Site[]; onError(error: unknown): void }) {
  const [siteId, setSiteId] = useState('');
  const visible = useMemo(() => siteId ? runs.filter((run) => run.siteId === siteId) : runs, [runs, siteId]);
  return <><PageHeader eyebrow="EXECUTION RECORDS" title="Run history" description="Every manual, scheduled and batch run is recorded locally."
    actions={<select aria-label="Filter by site" value={siteId} onChange={(event) => setSiteId(event.target.value)}><option value="">All sites</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>} />
    <section className="panel table-panel"><div className="table-head"><span>Status</span><span>Site</span><span>Trigger</span><span>Finished</span><span>Details</span></div>
      {visible.length === 0 ? <div className="table-empty">No runs yet. Your first test run will show up here.</div> : visible.map((run) => <div className="table-row" key={run.id}><span><i className={`result-dot ${run.status}`} />{run.status}</span><strong>{run.siteName || sites.find((site) => site.id === run.siteId)?.name}</strong><span>{run.trigger}</span><span>{new Date(run.finishedAt).toLocaleString()}</span><span className="run-details" title={run.error ?? run.message ?? ''}>{run.error ?? run.message ?? '—'}{run.screenshotPath && <button className="text-button" onClick={() => void window.siteRunner.runs.openScreenshot(run.id).catch(onError)}>Open screenshot</button>}</span></div>)}</section>
  </>;
}

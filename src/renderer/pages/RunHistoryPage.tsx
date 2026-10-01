import type { RunRecord, Site } from '../../shared/types';
import { PageHeader } from '../App';

export function RunHistoryPage({ runs, sites }: { runs: RunRecord[]; sites: Site[] }) {
  return <><PageHeader eyebrow="EXECUTION RECORDS" title="Run history" description="Every manual, scheduled and batch run is recorded locally." />
    <section className="panel table-panel"><div className="table-head"><span>Status</span><span>Site</span><span>Trigger</span><span>Finished</span><span>Details</span></div>
      {runs.length === 0 ? <div className="table-empty">No runs yet. Your first test run will show up here.</div> : runs.map((run) => <div className="table-row" key={run.id}><span><i className={`result-dot ${run.status}`} />{run.status}</span><strong>{run.siteName || sites.find((site) => site.id === run.siteId)?.name}</strong><span>{run.trigger}</span><span>{new Date(run.finishedAt).toLocaleString()}</span><span title={run.error ?? run.message ?? ''}>{run.error ?? run.message ?? '—'}</span></div>)}</section>
  </>;
}

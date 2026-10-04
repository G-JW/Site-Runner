import type { RuntimeSnapshot } from './types.js';

export function busySiteIds(state: RuntimeSnapshot): Set<string> {
  return new Set([...state.runs.map((run) => run.siteId), ...state.batches.flatMap((batch) => batch.phase === 'running' ? batch.siteIds.slice(batch.completed) : [])]);
}

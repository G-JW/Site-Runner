import type { RuntimeSnapshot } from '../../shared/types.js';
import { busySiteIds } from '../../shared/runtime.js';
import type { AutomationRunner } from '../automation/runner.js';
import type { BatchRunner } from '../automation/batch-runner.js';

export class RuntimeService {
  private revision = 0;
  private readonly listeners = new Set<(state: RuntimeSnapshot) => void>();
  constructor(private readonly runner: AutomationRunner, private readonly batches: BatchRunner[]) {
    const changed = () => {
      this.revision++;
      const state = this.snapshot();
      for (const listener of this.listeners) {
        try { listener(state); } catch (error) { console.error('Could not publish task state:', error); }
      }
    };
    runner.onState(changed); for (const batch of batches) batch.onState(changed);
  }
  stopBatch(id: string): void {
    if (!this.batches.some((batch) => batch.stopBatch(id))) throw new Error('Batch has already finished');
  }
  snapshot(): RuntimeSnapshot { return { revision: this.revision, runs: this.runner.getActiveRuns(), batches: this.batches.flatMap((batch) => batch.getActiveBatches()) }; }
  onState(listener: (state: RuntimeSnapshot) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  isBusy(siteId: string): boolean { return busySiteIds(this.snapshot()).has(siteId); }
  assertIdle(siteId: string): void { if (this.isBusy(siteId)) throw new Error('This site is running or waiting in a batch; wait for it to finish'); }
}

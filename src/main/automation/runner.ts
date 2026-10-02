import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { RunLogEntry, RunRecord, RunTrigger, SiteRunResult } from '../../shared/types.js';
import type { ProfileService } from '../profiles/profile-service.js';
import type { DataService } from '../services/data-service.js';
import type { AutomationExecutionResult, AutomationRequest, AutomationWorkerMessage } from './types.js';

export type AutomationExecutor = (request: AutomationRequest, emit: (entry: RunLogEntry) => void) => Promise<AutomationExecutionResult>;

export class AutomationRunner {
  private readonly runningSites = new Set<string>();

  constructor(
    private readonly data: DataService,
    private readonly profiles: ProfileService,
    private readonly screenshotsRoot: string,
    private readonly emit: (entry: RunLogEntry) => void,
    private readonly executor: AutomationExecutor = runInWorker,
  ) {}

  isRunning(siteId: string): boolean { return this.runningSites.has(siteId); }

  async runSite(siteId: string, trigger: RunTrigger, headless?: boolean): Promise<SiteRunResult> {
    if (this.runningSites.has(siteId)) throw new Error('This site is already running');
    const site = this.data.getSite(siteId);
    this.profiles.assertNotRecording(site.browserProfileId);
    this.runningSites.add(siteId);
    const timestamp = new Date();
    const month = timestamp.toISOString().slice(0, 7);
    const fileStamp = timestamp.toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const screenshotPath = path.join(this.screenshotsRoot, month, `${site.id}-${fileStamp}.png`);
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const settings = this.data.getSettings();
    try {
      let result: AutomationExecutionResult;
      try {
        result = await this.executor({
          siteId: site.id, siteName: site.name, url: site.url, script: site.script,
          timeoutMs: site.timeoutMs, profilePath: this.profiles.getProfilePath(site.browserProfileId),
          screenshotPath, headless: headless ?? settings.browserHeadless,
        }, this.emit);
      } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        this.emit({ siteId, level: 'error', message, timestamp: new Date().toISOString() });
        result = {
          siteId, siteName: site.name, status: 'failed', message: null, error: message,
          startedAt: timestamp.toISOString(), finishedAt: new Date().toISOString(),
          screenshotPath: null, lastUrl: null,
        };
      }
      const record: RunRecord = {
        id: randomUUID(), siteId: site.id, siteName: site.name, startedAt: result.startedAt,
        finishedAt: result.finishedAt, status: result.status, message: result.message,
        error: result.error, lastUrl: result.lastUrl, screenshotPath: result.screenshotPath, trigger,
      };
      this.data.saveRun(record);
      return result;
    } finally {
      this.runningSites.delete(siteId);
    }
  }
}

export function runInWorker(request: AutomationRequest, emit: (entry: RunLogEntry) => void): Promise<AutomationExecutionResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./automation-worker.js', import.meta.url), { workerData: request });
    let settled = false;
    const timer = setTimeout(() => {
      void worker.terminate();
      if (!settled) reject(new Error(`Run exceeded ${request.timeoutMs}ms`));
    }, request.timeoutMs + 5_000);
    worker.on('message', (message: AutomationWorkerMessage) => {
      if (message.type === 'log') emit(message.entry);
      if (message.type === 'result') {
        settled = true; clearTimeout(timer); resolve(message.result);
      }
    });
    worker.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    worker.once('exit', (code) => { if (!settled && code !== 0) { settled = true; clearTimeout(timer); reject(new Error(`Automation worker exited with code ${code}`)); } });
  });
}

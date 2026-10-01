import { parentPort, workerData } from 'node:worker_threads';
import type { RunLogEntry } from '../../shared/types.js';
import type { AutomationRequest, AutomationWorkerMessage } from './types.js';
import { executeAutomation } from './worker-execution.js';

if (!parentPort) throw new Error('Automation worker requires a parent port');
const port = parentPort;
const request = workerData as AutomationRequest;
const emit = (entry: RunLogEntry) => port.postMessage({ type: 'log', entry } satisfies AutomationWorkerMessage);
void executeAutomation(request, emit).then((result) => {
  port.postMessage({ type: 'result', result } satisfies AutomationWorkerMessage);
}).catch((error: unknown) => {
  port.postMessage({ type: 'result', result: {
    siteId: request.siteId, siteName: request.siteName, status: 'failed', message: null,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), screenshotPath: null, lastUrl: null,
  } } satisfies AutomationWorkerMessage);
});

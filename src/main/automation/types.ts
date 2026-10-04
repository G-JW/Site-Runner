import type { RunLogEntry, SiteRunResult, VisitOptions } from '../../shared/types.js';

export interface AutomationRequest {
  siteId: string;
  siteName: string;
  url: string;
  script: string | null;
  timeoutMs: number;
  profilePath: string;
  screenshotPath: string;
  headless: boolean;
  visitOptions?: VisitOptions;
}

export interface AutomationExecutionResult extends SiteRunResult {
  lastUrl: string | null;
}

export type AutomationWorkerMessage =
  | { type: 'log'; entry: RunLogEntry }
  | { type: 'result'; result: AutomationExecutionResult };

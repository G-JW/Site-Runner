export type RunStatus = 'success' | 'failed';
export type RunTrigger = 'manual' | 'schedule' | 'batch';
export type NotificationLevel = 'normal' | 'alert';
export type NotificationPolicy = 'all' | 'normal' | 'alert';
export type ProviderType = 'ntfy' | 'webhook';

export interface AppInfo { name: string; version: string; userDataPath: string }
export interface SiteSchedule { enabled: boolean; cron: string }
export interface Site {
  id: string; name: string; url: string; enabled: boolean; script: string | null;
  browserProfileId: string; timeoutMs: number; schedule: SiteSchedule;
  createdAt: string; updatedAt: string; lastRun: RunRecord | null;
}
export type SiteInput = Pick<Site, 'name' | 'url' | 'enabled' | 'script' | 'browserProfileId' | 'timeoutMs' | 'schedule'> & { id?: string };
export interface BrowserProfile { id: string; name: string; createdAt: string }
export interface RunRecord {
  id: string; siteId: string; siteName: string; startedAt: string; finishedAt: string;
  status: RunStatus; message: string | null; error: string | null; lastUrl: string | null;
  screenshotPath: string | null; trigger: RunTrigger;
}
export interface RunLogEntry { siteId: string; level: 'info' | 'warn' | 'error'; message: string; timestamp: string }
export interface SiteRunResult {
  siteId: string; siteName: string; status: RunStatus; message: string | null; error: string | null;
  startedAt: string; finishedAt: string; screenshotPath: string | null;
}
export interface BatchResult {
  startedAt: string; finishedAt: string; total: number; success: number; failed: number; results: SiteRunResult[];
}
export interface AppSettings {
  defaultTimeoutMs: number; browserHeadless: boolean; notificationEnabled: boolean; notifyScheduledRuns: boolean;
}
export interface NotificationChannel {
  id: string; name: string; providerType: ProviderType; enabled: boolean; eventPolicy: NotificationPolicy;
  config: Record<string, unknown>; createdAt: string; updatedAt: string;
}
export type NotificationChannelInput = Pick<NotificationChannel, 'name' | 'providerType' | 'enabled' | 'eventPolicy' | 'config'> & { id?: string };
export interface NotificationMessage {
  title: string; body: string; level: NotificationLevel; timestamp: string;
  batch?: { total: number; success: number; failed: number; failedSites: string[] };
}

export interface SiteRunnerApi {
  app: { info(): Promise<AppInfo> };
  sites: { list(): Promise<Site[]>; save(input: SiteInput): Promise<Site>; remove(id: string): Promise<void> };
  profiles: {
    list(): Promise<BrowserProfile[]>; create(name: string): Promise<BrowserProfile>;
    remove(id: string): Promise<void>; open(id: string): Promise<void>;
  };
  runs: {
    runSite(id: string): Promise<SiteRunResult>; runEnabledSites(): Promise<BatchResult>;
    list(siteId?: string): Promise<RunRecord[]>; openScreenshot(runId: string): Promise<string>;
    onLog(listener: (entry: RunLogEntry) => void): () => void;
  };
  notifications: {
    list(): Promise<NotificationChannel[]>; save(input: NotificationChannelInput): Promise<NotificationChannel>;
    remove(id: string): Promise<void>; test(id: string): Promise<void>;
  };
  settings: { get(): Promise<AppSettings>; update(settings: Partial<AppSettings>): Promise<AppSettings> };
}

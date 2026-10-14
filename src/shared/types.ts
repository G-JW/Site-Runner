export type RunStatus = 'success' | 'failed';
export type RunTrigger = 'manual' | 'schedule' | 'batch';
export type NotificationLevel = 'normal' | 'alert';
export type NotificationPolicy = 'all' | 'normal' | 'alert';
export type ProviderType = 'ntfy' | 'webhook';
export type AppLanguage = 'en' | 'zh-CN';

export interface AppInfo { name: string; version: string; userDataPath: string; platform?: string; executablePath?: string; cliAppPath?: string }
export interface RecordingInput { url: string; profileId: string }
export interface RecordingStatus { state: 'idle' | 'recording' | 'ready' | 'failed'; error: string | null }
export interface ScriptTemplate {
  id: string; name: Record<AppLanguage, string>; description: Record<AppLanguage, string>;
  instructions: Record<AppLanguage, string>; script: string | null;
}
export type ScriptTemplateInput = Omit<ScriptTemplate, 'id'> & { id?: string };
export interface SiteSchedule { enabled: boolean; cron: string; mode?: 'inherit' | 'custom' | 'manual' }
export interface VisitOptions { stayMs: number; detectChallenges: boolean }
export interface SiteFolder { id: string; name: string; schedule: SiteSchedule }
export interface Site {
  id: string; name: string; url: string; enabled: boolean; script: string | null;
  browserProfileId: string; timeoutMs: number; schedule: SiteSchedule; folderId: string | null; visitOptions: VisitOptions;
  createdAt: string; updatedAt: string; lastRun: RunRecord | null;
}
export type SiteInput = Pick<Site, 'name' | 'url' | 'enabled' | 'script' | 'browserProfileId' | 'timeoutMs' | 'schedule'> & { id?: string; folderId?: string | null; visitOptions?: VisitOptions };
export type SiteRule = Omit<SiteInput, 'id' | 'browserProfileId'>;
export interface BrowserProfile { id: string; name: string; createdAt: string }
export interface RunRecord {
  id: string; siteId: string; siteName: string; startedAt: string; finishedAt: string;
  status: RunStatus; message: string | null; error: string | null; lastUrl: string | null;
  screenshotPath: string | null; trigger: RunTrigger;
}
export interface RunLogEntry { siteId: string; level: 'info' | 'warn' | 'error'; message: string; timestamp: string }
export interface ActiveRun { siteId: string; siteName: string; profileId: string; trigger: RunTrigger; phase: 'queued' | 'running'; requestedAt: string }
export interface ActiveBatch { id: string; siteIds: string[]; trigger: RunTrigger; total: number; completed: number; success: number; failed: number; currentSiteId: string | null; phase: 'running' | 'notifying'; stopRequested?: boolean }
export interface RuntimeSnapshot { revision: number; runs: ActiveRun[]; batches: ActiveBatch[] }
export interface RunQuery { siteId?: string; status?: RunStatus; from?: string; to?: string; offset?: number }
export interface NotificationReceipt { id: string; channelName: string; title: string; success: boolean; error: string | null; createdAt: string }
export interface ConfigurationFile {
  format: 'site-runner-configuration'; version: 1;
  profiles: Array<{ key: string; name: string }>;
  folders: Array<{ key: string; name: string; schedule: SiteSchedule }>;
  sites: Array<SiteRule & { profileKey: string; folderKey: string | null }>;
  templates: ScriptTemplateInput[]; settings: AppSettings;
}
export interface SiteRunResult {
  siteId: string; siteName: string; status: RunStatus; message: string | null; error: string | null;
  startedAt: string; finishedAt: string; screenshotPath: string | null;
}
export interface BatchResult {
  startedAt: string; finishedAt: string; total: number; success: number; failed: number; results: SiteRunResult[]; planned?: number; stopped?: boolean;
}
export interface AppSettings {
  defaultTimeoutMs: number; browserHeadless: boolean; notificationEnabled: boolean; notifyScheduledRuns: boolean;
  language: AppLanguage;
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  cleanup: CleanupPolicy;
}
export interface CleanupPolicy { automatic: boolean; historyDays: number; backupDays: number }
export interface CleanupReport { runs: number; receipts: number; screenshots: number; backups: number; bytes: number; errors: string[] }
export interface CleanupPreview extends CleanupReport { id: string }
export interface CleanupStatus { finishedAt: string; report: CleanupReport }
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
  updates: {
    state(): Promise<import('./updates.js').UpdateState>;
    check(): Promise<import('./updates.js').UpdateState>;
    download(): Promise<import('./updates.js').UpdateState>;
    install(): Promise<import('./updates.js').UpdateState>;
    onState(listener: (state: import('./updates.js').UpdateState) => void): () => void;
  };
  app: { info(): Promise<AppInfo>; openDataFolder(): Promise<void>; onClosing(listener: () => void): () => void };
  sites: {
    list(): Promise<Site[]>; save(input: SiteInput): Promise<Site>; remove(id: string): Promise<void>;
    exportRules(ids: string[]): Promise<boolean>; previewImport(): Promise<SiteRule[] | null>;
    importRules(rules: SiteRule[], profileId: string): Promise<Site[]>;
  };
  folders: {
    list(): Promise<SiteFolder[]>; save(input: { id?: string; name: string; schedule?: SiteSchedule }): Promise<SiteFolder>;
    remove(id: string): Promise<void>; moveSites(ids: string[], folderId: string | null): Promise<void>;
  };
  templates: {
    list(): Promise<ScriptTemplate[]>; save(input: ScriptTemplateInput): Promise<ScriptTemplate>;
    remove(id: string): Promise<void>; restoreDefaults(): Promise<ScriptTemplate[]>;
    exportFiles(ids: string[]): Promise<boolean>; previewImport(): Promise<ScriptTemplateInput[] | null>;
    importFiles(inputs: ScriptTemplateInput[]): Promise<ScriptTemplate[]>;
  };
  recorder: { start(input: RecordingInput): Promise<void>; status(): Promise<RecordingStatus>; finish(): Promise<string>; cancel(): Promise<void> };
  profiles: {
    list(): Promise<BrowserProfile[]>; create(name: string): Promise<BrowserProfile>;
    remove(id: string): Promise<void>; open(id: string, url?: string): Promise<void>;
  };
  runs: {
    stopBatch(id: string): Promise<void>; schedulePreview(cron: string): Promise<string | null>; nextSchedules(): Promise<Record<string, string | null>>;
    state(): Promise<RuntimeSnapshot>; onState(listener: (state: RuntimeSnapshot) => void): () => void;
    runSite(id: string): Promise<SiteRunResult>; runEnabledSites(): Promise<BatchResult>; runSites(ids: string[]): Promise<BatchResult>;
    list(siteId?: string): Promise<RunRecord[]>; openScreenshot(runId: string): Promise<string>;
    search(query: RunQuery): Promise<RunRecord[]>; detail(id: string): Promise<{ run: RunRecord; logs: RunLogEntry[] }>;
    onLog(listener: (entry: RunLogEntry) => void): () => void;
  };
  notifications: {
    list(): Promise<NotificationChannel[]>; save(input: NotificationChannelInput): Promise<NotificationChannel>;
    remove(id: string): Promise<void>; test(id: string): Promise<void>;
    receipts(): Promise<NotificationReceipt[]>;
  };
  settings: {
    get(): Promise<AppSettings>; update(settings: Partial<AppSettings>): Promise<AppSettings>;
    exportConfiguration(): Promise<boolean>; previewConfiguration(): Promise<ConfigurationFile | null>;
    importConfiguration(file: ConfigurationFile, applySettings: boolean): Promise<{ sites: number; templates: number }>;
  };
  cleanup: { preview(): Promise<CleanupPreview>; execute(id: string): Promise<CleanupReport>; status(): Promise<CleanupStatus | null> };
}

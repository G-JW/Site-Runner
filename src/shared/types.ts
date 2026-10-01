export interface AppInfo {
  name: string;
  version: string;
  userDataPath: string;
}

export interface SiteRunnerApi {
  app: {
    info(): Promise<AppInfo>;
  };
}

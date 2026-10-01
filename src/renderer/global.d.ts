import type { SiteRunnerApi } from '../shared/types';

declare global {
  interface Window {
    siteRunner: SiteRunnerApi;
  }
}

export {};

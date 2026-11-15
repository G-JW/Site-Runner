import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import type { ProfileService } from "./profile-service.js";

interface Session {
  context: BrowserContext;
  endpoint: string;
  unlock(): void;
}
interface Entry {
  ready: Promise<Session>;
  users: number;
  closing?: Promise<void>;
}
export interface RunBrowserLease {
  endpoint: string;
  pageUrl: string;
  release(): Promise<void>;
}

/** Own one persistent browser per active profile, and lend a separate page to each worker. */
export class RunBrowserPool {
  private readonly sessions = new Map<string, Entry>();
  constructor(
    private readonly profiles: Pick<
      ProfileService,
      "acquireForRun" | "getProfilePath"
    >,
  ) {}
  isBusy(): boolean {
    return this.sessions.size > 0;
  }

  async acquire(id: string, headless: boolean): Promise<RunBrowserLease> {
    let entry = this.sessions.get(id);
    if (entry?.closing) {
      await entry.closing;
      return this.acquire(id, headless);
    }
    if (!entry) {
      entry = { ready: this.launch(id, headless), users: 0 };
      this.sessions.set(id, entry);
    }
    const current = entry;
    current.users++;
    let page: Page | undefined;
    try {
      const session = await current.ready;
      page = await session.context.newPage();
      const ownedPage = page;
      const pageUrl = `about:blank#site-runner-${randomUUID()}`;
      await page.goto(pageUrl, { timeout: 5000 });
      let released = false;
      return {
        endpoint: session.endpoint,
        pageUrl,
        release: async () => {
          if (released) return;
          released = true;
          // Also close popups belonging to this page, without touching another task's tabs.
          await Promise.allSettled(
            session.context.pages().map(async (candidate) => {
              let opener = await candidate.opener();
              while (opener && opener !== ownedPage)
                opener = await opener.opener();
              if (opener === ownedPage) await candidate.close();
            }),
          );
          await ownedPage.close().catch(() => undefined);
          await this.release(id, current);
        },
      };
    } catch (error) {
      await page?.close().catch(() => undefined);
      await this.release(id, current);
      throw error;
    }
  }

  private async launch(id: string, headless: boolean): Promise<Session> {
    const unlock = await this.profiles.acquireForRun(id);
    let context: BrowserContext | undefined;
    try {
      const { chromium } = await import("playwright");
      context = await chromium.launchPersistentContext(
        this.profiles.getProfilePath(id),
        { headless },
      );
      // Playwright's local named pipe preserves the full API and is never exposed on a public port.
      const { endpoint } = await context.browser()!.bind(`Site Runner ${id}`);
      return { context, endpoint, unlock };
    } catch (error) {
      await context?.close().catch(() => undefined);
      unlock();
      throw error;
    }
  }

  private async release(id: string, entry: Entry): Promise<void> {
    entry.users--;
    if (!entry.users) await this.close(id, entry);
  }

  private close(id: string, entry: Entry): Promise<void> {
    if (!entry.closing)
      entry.closing = (async () => {
        try {
          const session = await entry.ready;
          try {
            await session.context.close().catch(() => undefined);
          } finally {
            session.unlock();
          }
        } catch {
          /* Failed launches already release the profile lock. */
        } finally {
          if (this.sessions.get(id) === entry) this.sessions.delete(id);
        }
      })();
    return entry.closing;
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(
      [...this.sessions].map(([id, entry]) => this.close(id, entry)),
    );
  }
}

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import type { BrowserProfile } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';

export class ProfileService {
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly recordingProfiles = new Set<string>();
  private readonly openingProfiles = new Set<string>();
  private readonly runQueues = new Map<string, Promise<void>>();
  private readonly opening = new Set<Promise<void>>();
  private closing = false;
  hasOpenBrowsers(): boolean { return this.contexts.size > 0 || this.openingProfiles.size > 0 || this.recordingProfiles.size > 0; }

  private assertOpen(): void { if (this.closing) throw new Error('Application is closing'); }

  async acquireForRun(id: string): Promise<() => void> {
    this.assertOpen();
    this.data.getProfile(id); this.assertNotRecording(id);
    if (this.contexts.has(id) || this.openingProfiles.has(id)) throw new Error('Close the profile browser before running tasks');
    const previous = this.runQueues.get(id) ?? Promise.resolve();
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => { unlock = resolve; });
    const tail = previous.then(() => gate);
    this.runQueues.set(id, tail);
    await previous;
    let released = false;
    return () => {
      if (released) return; released = true; unlock();
      if (this.runQueues.get(id) === tail) this.runQueues.delete(id);
    };
  }

  private assertNotRunning(id: string): void {
    if (this.runQueues.has(id)) throw new Error('This browser profile has running or queued tasks');
  }

  constructor(private readonly data: DataService, private readonly profilesRoot: string) {
    mkdirSync(profilesRoot, { recursive: true });
  }

  getProfilePath(id: string): string {
    this.data.getProfile(id);
    return path.join(this.profilesRoot, id);
  }

  assertNotRecording(id: string): void {
    if (this.recordingProfiles.has(id)) throw new Error('This browser profile is being used by the recorder');
  }

  reserveForRecording(id: string): () => void {
    this.assertOpen();
    this.assertNotRunning(id);
    this.data.getProfile(id); this.assertNotRecording(id);
    if (this.contexts.has(id) || this.openingProfiles.has(id)) throw new Error('Close the profile browser before recording');
    this.recordingProfiles.add(id);
    let released = false;
    return () => { if (!released) { released = true; this.recordingProfiles.delete(id); } };
  }

  create(name: string): BrowserProfile {
    const profile = this.data.createProfile(name);
    mkdirSync(this.getProfilePath(profile.id), { recursive: true });
    return profile;
  }

  remove(id: string): void {
    this.assertNotRunning(id);
    this.assertNotRecording(id);
    if (this.contexts.has(id) || this.openingProfiles.has(id)) throw new Error('Close the profile browser before deleting it');
    const profilePath = this.getProfilePath(id);
    this.data.removeProfile(id);
    rmSync(profilePath, { recursive: true, force: true });
  }

  async open(id: string, url?: string): Promise<void> {
    this.assertOpen();
    const work = this.openProfile(id, url);
    this.opening.add(work);
    void work.then(() => this.opening.delete(work), () => this.opening.delete(work));
    return work;
  }

  private async openProfile(id: string, url?: string): Promise<void> {
    this.assertNotRunning(id);
    this.assertNotRecording(id);
    if (url && !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Website URL must use HTTP or HTTPS');
    if (this.openingProfiles.has(id)) throw new Error('Browser is opening; try again shortly');
    const existing = this.contexts.get(id);
    if (existing) {
      const page = existing.pages()[0] ?? await existing.newPage();
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.bringToFront(); return;
    }
    this.openingProfiles.add(id);
    try {
    const profilePath = this.getProfilePath(id);
    mkdirSync(profilePath, { recursive: true });
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profilePath, { headless: false });
    this.contexts.set(id, context);
    context.once('close', () => this.contexts.delete(id));
    const page = context.pages()[0] ?? await context.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.bringToFront();
    } finally { this.openingProfiles.delete(id); }
  }

  async closeAll(): Promise<void> {
    this.closing = true;
    await Promise.allSettled([...this.opening]);
    const contexts = [...this.contexts.values()];
    this.contexts.clear();
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

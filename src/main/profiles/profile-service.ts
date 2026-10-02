import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import type { BrowserProfile } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';

export class ProfileService {
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly recordingProfiles = new Set<string>();
  private readonly openingProfiles = new Set<string>();

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
    this.assertNotRecording(id);
    if (this.contexts.has(id) || this.openingProfiles.has(id)) throw new Error('Close the profile browser before deleting it');
    const profilePath = this.getProfilePath(id);
    this.data.removeProfile(id);
    rmSync(profilePath, { recursive: true, force: true });
  }

  async open(id: string): Promise<void> {
    this.assertNotRecording(id);
    if (this.contexts.has(id) || this.openingProfiles.has(id)) return;
    this.openingProfiles.add(id);
    try {
    const profilePath = this.getProfilePath(id);
    mkdirSync(profilePath, { recursive: true });
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profilePath, { headless: false });
    this.contexts.set(id, context);
    context.once('close', () => this.contexts.delete(id));
    if (context.pages().length === 0) await context.newPage();
    } finally { this.openingProfiles.delete(id); }
  }

  async closeAll(): Promise<void> {
    const contexts = [...this.contexts.values()];
    this.contexts.clear();
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

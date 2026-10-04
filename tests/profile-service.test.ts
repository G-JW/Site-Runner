import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';
import { DataService } from '../src/main/services/data-service.js';

describe('ProfileService paths', () => {
  let database: AppDatabase;
  let profiles: ProfileService;
  beforeEach(() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'site-runner-profile-'));
    database = new AppDatabase(path.join(directory, 'test.sqlite3'));
    profiles = new ProfileService(new DataService(database.connection), path.join(directory, 'profiles'));
  });
  afterEach(() => database.close());

  it('creates and removes the local profile directory', () => {
    const profile = profiles.create('Default');
    const profilePath = profiles.getProfilePath(profile.id);
    expect(existsSync(profilePath)).toBe(true);
    profiles.remove(profile.id);
    expect(existsSync(profilePath)).toBe(false);
  });

  it('queues tasks sharing a profile and protects queued profiles from manual use', async () => {
    const profile = profiles.create('Queue');
    const first = await profiles.acquireForRun(profile.id);
    let acquired = false;
    const second = profiles.acquireForRun(profile.id).then((release) => { acquired = true; return release; });
    await Promise.resolve(); expect(acquired).toBe(false);
    await expect(profiles.open(profile.id)).rejects.toThrow(/queued/);
    expect(() => profiles.reserveForRecording(profile.id)).toThrow(/queued/);
    expect(() => profiles.remove(profile.id)).toThrow(/queued/);
    first(); const release = await second; expect(acquired).toBe(true);
    release(); release();
    const recordRelease = profiles.reserveForRecording(profile.id); recordRelease();
  });

  it('protects a profile during recording and releases it afterward', async () => {
    const profile = profiles.create('Recorder');
    const release = profiles.reserveForRecording(profile.id);
    expect(() => profiles.reserveForRecording(profile.id)).toThrow(/recorder/);
    expect(() => profiles.remove(profile.id)).toThrow(/recorder/);
    await expect(profiles.open(profile.id)).rejects.toThrow(/recorder/);
    release();
    expect(() => profiles.assertNotRecording(profile.id)).not.toThrow();
    profiles.remove(profile.id);
  });
});

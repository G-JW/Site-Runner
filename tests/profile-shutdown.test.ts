import { tmpdir as systemTemporaryDirectory } from "node:os";
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';

const mock = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launchPersistentContext: mock.launch } }));

it('waits for a profile browser opening during shutdown and closes it before returning', async () => {
  const root = mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-profile-exit-')), database = new AppDatabase(path.join(root, 'test.sqlite3'));
  try {
    const profiles = new ProfileService(new DataService(database.connection), path.join(root, 'profiles')), profile = profiles.create('Default');
    const close = vi.fn(async () => undefined); let ready!: () => void;
    const gate = new Promise<void>((resolve) => { ready = resolve; });
    mock.launch.mockImplementation(async () => { await gate; return { close, once: vi.fn(), pages: () => [{ bringToFront: async () => undefined }] }; });
    const opening = profiles.open(profile.id); await vi.waitFor(() => expect(mock.launch).toHaveBeenCalled());
    let finished = false; const shutdown = profiles.closeAll().then(() => { finished = true; });
    await expect(profiles.open(profile.id)).rejects.toThrow(/closing/); await expect(profiles.acquireForRun(profile.id)).rejects.toThrow(/closing/);
    expect(() => profiles.reserveForRecording(profile.id)).toThrow(/closing/); expect(finished).toBe(false);
    ready(); await opening; await shutdown; expect(close).toHaveBeenCalledOnce(); expect(finished).toBe(true);
  } finally { database.close(); }
});

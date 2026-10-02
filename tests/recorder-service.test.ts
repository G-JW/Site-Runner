import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';
import { RecorderService } from '../src/main/recording/recorder-service.js';

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock('electron', () => ({ utilityProcess: { fork } }));
const databases: AppDatabase[] = [];
afterEach(() => { databases.splice(0).forEach((database) => database.close()); fork.mockReset(); });

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'site-recorder-'));
  const database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
  const profiles = new ProfileService(new DataService(database.connection), path.join(root, 'profiles'));
  const profile = profiles.create('Default');
  fork.mockImplementation((_module: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; postMessage(): void; kill(): void };
    child.stderr = new EventEmitter();
    child.postMessage = () => { setImmediate(() => child.emit('exit', 130)); };
    child.kill = () => { child.emit('exit', 9); };
    writeFileSync(args[args.indexOf('--output') + 1]!, "import { test } from '@playwright/test'; test('test', async ({ page }) => { await page.getByRole('button').click(); });");
    setImmediate(() => child.emit('message', 'ready'));
    return child;
  });
  return { profiles, profile, service: new RecorderService(profiles, path.join(root, 'recordings'), () => false) };
}

it('finishes or cancels a recording and releases the reserved profile', async () => {
  const { profiles, profile, service } = setup();
  await service.start({ url: 'https://example.com', profileId: profile.id });
  expect(() => profiles.assertNotRecording(profile.id)).toThrow();
  expect(await service.finish()).toContain("page.getByRole('button').click()");
  expect(service.getStatus().state).toBe('idle');
  expect(() => profiles.assertNotRecording(profile.id)).not.toThrow();
  await service.start({ url: 'https://example.com', profileId: profile.id });
  await service.cancel();
  expect(service.getStatus().state).toBe('idle');
  expect(() => profiles.assertNotRecording(profile.id)).not.toThrow();
});

it('cancels startup before spawning a helper, without leaving a locked profile', async () => {
  const { profiles, profile, service } = setup();
  const starting = service.start({ url: 'https://example.com', profileId: profile.id });
  const cancelled = service.cancel();
  await expect(starting).rejects.toThrow(/cancelled/);
  await cancelled;
  expect(fork).not.toHaveBeenCalled();
  expect(service.getStatus().state).toBe('idle');
  expect(() => profiles.assertNotRecording(profile.id)).not.toThrow();
});

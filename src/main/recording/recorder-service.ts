import { utilityProcess, type UtilityProcess } from 'electron';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordingInput, RecordingStatus } from '../../shared/types.js';
import type { ProfileService } from '../profiles/profile-service.js';
import { convertRecording } from './convert.js';

export class RecorderService {
  private child: UtilityProcess | null = null;
  private sessionPath: string | null = null;
  private status: RecordingStatus = { state: 'idle', error: null };
  private exitPromise: Promise<void> = Promise.resolve();
  private releaseProfile: (() => void) | null = null;
  private stopping = false;
  private generation = 0;

  constructor(private readonly profiles: ProfileService, private readonly recordingsRoot: string, private readonly isProfileRunning: (id: string) => boolean) {}

  getStatus(): RecordingStatus { return { ...this.status }; }

  async start(input: RecordingInput): Promise<void> {
    if (this.status.state === 'recording' || this.status.state === 'ready') throw new Error('Finish or cancel the current recording first');
    const url = new URL(input.url);
    if (!['http:', 'https:', 'data:'].includes(url.protocol)) throw new Error('Recording URL must use HTTP or HTTPS');
    this.status = { state: 'recording', error: null }; this.stopping = false;
    const generation = ++this.generation;
    try {
      await this.cleanup();
      if (generation !== this.generation) throw new Error('Recording cancelled');
      if (this.isProfileRunning(input.profileId)) throw new Error('This browser profile is running a task');
      this.releaseProfile = this.profiles.reserveForRecording(input.profileId);
      await mkdir(this.recordingsRoot, { recursive: true });
      const sessionPath = await mkdtemp(path.join(this.recordingsRoot, 'session-'));
      if (generation !== this.generation) { await rm(sessionPath, { recursive: true, force: true }); throw new Error('Recording cancelled'); }
      this.sessionPath = sessionPath;
      const env = { ...process.env };
      delete env.PWTEST_CLI_IS_UNDER_TEST; delete env.PWTEST_CLI_HEADLESS; delete env.PW_CODEGEN_NO_INSPECTOR;
      delete env.TEST_INSPECTOR_LANGUAGE;
      const child = utilityProcess.fork(fileURLToPath(new URL('./recording-worker.js', import.meta.url)), ['codegen', '--target=playwright-test', '--timeout=30000', '--output', path.join(this.sessionPath, 'recording.js'), '--user-data-dir', this.profiles.getProfilePath(input.profileId), input.url], { stdio: 'pipe', serviceName: 'Site Runner Recorder', env });
      this.child = child;
      let errors = '';
      child.stderr?.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-4000); });
      this.exitPromise = new Promise((resolve) => child.once('exit', (code) => {
        this.child = null; this.releaseProfile?.(); this.releaseProfile = null;
        this.status = code === 0 || (this.stopping && code === 130) ? { state: 'ready', error: null } : { state: 'failed', error: errors || `Recorder exited with code ${code}` };
        resolve();
      }));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolve) => child.once('message', () => resolve())),
          this.exitPromise.then(() => { throw new Error(this.status.error ?? 'Recorder closed before it was ready'); }),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Recorder startup timed out')), 35_000); }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    } catch (error) {
      await this.stop();
      this.releaseProfile?.(); this.releaseProfile = null;
      if (generation === this.generation) this.status = { state: 'failed', error: error instanceof Error ? error.message : String(error) };
      throw error;
    }
  }

  async finish(): Promise<string> {
    await this.stop();
    if (this.status.state !== 'ready' || !this.sessionPath) throw new Error(this.status.error ?? 'Start a recording first');
    const script = convertRecording(await readFile(path.join(this.sessionPath, 'recording.js'), 'utf8'));
    await this.cleanup();
    this.status = { state: 'idle', error: null };
    return script;
  }

  async cancel(): Promise<void> {
    this.generation++;
    await this.stop(); await this.cleanup();
    this.releaseProfile?.(); this.releaseProfile = null;
    this.status = { state: 'idle', error: null };
  }

  private async stop(): Promise<void> {
    if (!this.child) return;
    this.stopping = true; this.child.postMessage('stop');
    const timer = setTimeout(() => this.child?.kill(), 10_000);
    try { await this.exitPromise; } finally { clearTimeout(timer); }
  }

  private async cleanup(): Promise<void> {
    if (this.sessionPath) await rm(this.sessionPath, { recursive: true, force: true });
    this.sessionPath = null;
  }
}

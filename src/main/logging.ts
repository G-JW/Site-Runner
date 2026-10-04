import { chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';

export interface LogRetention { maxBytes: number; archives: number }
const defaults: LogRetention = { maxBytes: 10 * 1024 * 1024, archives: 3 };

class RotatingLogDestination {
  private fd: number | null = null;
  private size = 0;
  private closed = false;
  private readonly file: string;

  constructor(directory: string, private readonly policy: LogRetention) {
    this.file = path.join(directory, 'site-runner.log');
    mkdirSync(directory, { recursive: true });
  }

  private open(): void {
    if (this.fd !== null) return;
    if (existsSync(this.file) && !lstatSync(this.file).isFile()) throw new Error('Log path is not a regular file');
    this.fd = openSync(this.file, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    chmodSync(this.file, 0o600);
    this.size = lstatSync(this.file).size;
  }

  private rotate(): void {
    if (this.fd !== null) { closeSync(this.fd); this.fd = null; }
    if (!this.policy.archives) { unlinkSync(this.file); return; }
    const last = `${this.file}.${this.policy.archives}`;
    if (existsSync(last)) unlinkSync(last);
    for (let index = this.policy.archives - 1; index >= 1; index--) {
      if (existsSync(`${this.file}.${index}`)) renameSync(`${this.file}.${index}`, `${this.file}.${index + 1}`);
    }
    renameSync(this.file, `${this.file}.1`);
  }

  write(chunk: string): void {
    if (this.closed) return;
    // Keep valid JSON and a strict file-size bound even for unusually large messages.
    if (Buffer.byteLength(chunk) > this.policy.maxBytes) chunk = JSON.stringify({ level: 40, time: Date.now(), msg: 'Oversized service log entry omitted', bytes: Buffer.byteLength(chunk) }) + '\n';
    try {
      this.open();
      if (this.size && this.size + Buffer.byteLength(chunk) > this.policy.maxBytes) { this.rotate(); this.open(); }
      const buffer = Buffer.from(chunk);
      let offset = 0;
      while (offset < buffer.length) offset += writeSync(this.fd!, buffer, offset, buffer.length - offset);
      this.size += buffer.length;
    } catch (error) {
      // Logging failures must not prevent automation results from being saved.
      if (this.fd !== null) { try { closeSync(this.fd); } catch { /* Already closed. */ } this.fd = null; }
      process.stderr.write(`Service log unavailable: ${error instanceof Error ? error.message : String(error)}\n${chunk}`);
    }
  }

  close(): void {
    this.closed = true;
    if (this.fd !== null) {
      try { fsyncSync(this.fd); } finally { closeSync(this.fd); this.fd = null; }
    }
  }
}

export function createLogger(logDirectory: string, policy: LogRetention = defaults) {
  if (!Number.isInteger(policy.maxBytes) || policy.maxBytes < 256 || !Number.isInteger(policy.archives) || policy.archives < 0 || policy.archives > 10) throw new Error('Invalid log retention');
  let destination: RotatingLogDestination | null = null;
  try { destination = new RotatingLogDestination(logDirectory, policy); }
  catch (error) { process.stderr.write(`Service log unavailable: ${String(error)}\n`); }
  return { logger: pino({ name: 'site-runner', level: process.env.LOG_LEVEL ?? 'info' }, destination ?? process.stderr),
    close: () => { try { destination?.close(); } catch (error) { process.stderr.write(`Could not close service log: ${String(error)}\n`); } } };
}

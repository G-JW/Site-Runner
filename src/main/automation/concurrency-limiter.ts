interface Waiter {
  resolve(release: () => void): void;
  reject(error: Error): void;
  signal: AbortSignal | undefined;
  abort(): void;
}

/** One limit shared by manual runs, scheduled runs and every batch. */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  constructor(private readonly limit: () => number) {}

  acquire(signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new RunCancelledError());
        return;
      }
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        abort: () => {
          const index = this.waiting.indexOf(waiter);
          if (index < 0) return;
          this.waiting.splice(index, 1);
          signal?.removeEventListener("abort", waiter.abort);
          reject(new RunCancelledError());
        },
      };
      this.waiting.push(waiter);
      signal?.addEventListener("abort", waiter.abort, { once: true });
      this.drain();
    });
  }

  private drain(): void {
    while (this.waiting.length && this.active < this.limit()) {
      const next = this.waiting.shift()!;
      next.signal?.removeEventListener("abort", next.abort);
      this.active++;
      let released = false;
      next.resolve(() => {
        if (released) return;
        released = true;
        this.active--;
        this.drain();
      });
    }
  }
}

/** User-stopped work which had not started must not create a failed run record. */
export class RunCancelledError extends Error {
  constructor() {
    super("Batch stopped before this task started");
  }
}

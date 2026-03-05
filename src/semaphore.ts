/**
 * Simple counting semaphore for limiting concurrent Ollama calls.
 * Prevents GPU OOM on systems with limited VRAM (e.g. 8 GB cards).
 *
 * Default concurrency: 1 (Ollama itself pipelines, but sending too many
 * requests causes VRAM pressure). Override with POLYGLOT_CONCURRENCY env var.
 */

/** Default concurrent Ollama requests. */
export const DEFAULT_CONCURRENCY = parseInt(
  process.env.POLYGLOT_CONCURRENCY ?? "1",
  10
) || 1;

/**
 * A counting semaphore — limits the number of concurrent tasks.
 *
 * Usage:
 * ```ts
 * const sem = new Semaphore(2);
 * const release = await sem.acquire();
 * try { await doWork(); } finally { release(); }
 * ```
 */
export class Semaphore {
  private _current = 0;
  private readonly _queue: Array<() => void> = [];

  constructor(readonly limit: number = DEFAULT_CONCURRENCY) {
    if (limit < 1) throw new RangeError("Semaphore limit must be ≥ 1");
  }

  /** Current number of active permits. */
  get active(): number {
    return this._current;
  }

  /** Number of callers waiting for a permit. */
  get waiting(): number {
    return this._queue.length;
  }

  /** Acquire a permit. Resolves when a slot is available. Returns a release function. */
  acquire(): Promise<() => void> {
    if (this._current < this.limit) {
      this._current++;
      return Promise.resolve(this._release.bind(this));
    }
    return new Promise<() => void>((resolve) => {
      this._queue.push(() => {
        this._current++;
        resolve(this._release.bind(this));
      });
    });
  }

  /** @internal Release a permit and unblock the next waiter. */
  private _release(): void {
    this._current--;
    const next = this._queue.shift();
    if (next) next();
  }
}

/** Shared global semaphore for Ollama calls. */
export const ollamaSemaphore = new Semaphore(DEFAULT_CONCURRENCY);

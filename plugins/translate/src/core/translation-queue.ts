import type { RequestPriority, TranslationRequest, TranslationResult } from './types';

export type QueueError = Error & { retryable?: boolean; code?: string; status?: number };

type QueueJob = {
  request: TranslationRequest;
  attempt: number;
  promise: Promise<TranslationResult>;
  resolve: (value: TranslationResult) => void;
  reject: (reason: unknown) => void;
  retryTimer?: ReturnType<typeof setTimeout>;
};

export type TranslationQueueOptions = {
  execute: (request: TranslationRequest) => Promise<TranslationResult>;
  onStart?: (request: TranslationRequest) => void;
  maxConcurrency?: number;
  requestsPerMinute?: number;
  retryDelayMs?: number;
  now?: () => number;
};

export class TranslationQueue {
  private readonly manual: string[] = [];
  private readonly visible: string[] = [];
  private readonly jobs = new Map<string, QueueJob>();
  private readonly inFlight = new Set<string>();
  private readonly requestTimes: number[] = [];
  private readonly maxConcurrency: number;
  private readonly requestsPerMinute: number;
  private readonly retryDelayMs: number;
  private readonly now: () => number;
  private running = false;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: TranslationQueueOptions) {
    this.maxConcurrency = options.maxConcurrency ?? 2;
    this.requestsPerMinute = options.requestsPerMinute ?? 22;
    this.retryDelayMs = options.retryDelayMs ?? 900;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    for (const job of this.jobs.values()) {
      if (job.retryTimer) clearTimeout(job.retryTimer);
      if (!this.inFlight.has(job.request.key)) job.reject(new Error('Translation queue stopped.'));
    }
    this.manual.length = 0;
    this.visible.length = 0;
    for (const key of [...this.jobs.keys()]) {
      if (!this.inFlight.has(key)) this.jobs.delete(key);
    }
  }

  enqueue(request: TranslationRequest): Promise<TranslationResult> {
    const existing = this.jobs.get(request.key);
    if (existing) {
      if (request.priority === 'manual' && existing.request.priority !== 'manual' && !this.inFlight.has(request.key)) {
        existing.request = { ...existing.request, priority: 'manual', requestSource: 'manual' };
        this.removeQueuedKey(this.visible, request.key);
        if (!this.manual.includes(request.key)) this.manual.push(request.key);
      }
      this.schedule();
      return existing.promise;
    }

    let resolve!: (value: TranslationResult) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<TranslationResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: QueueJob = { request, attempt: 0, promise, resolve, reject };
    this.jobs.set(request.key, job);
    this.queueFor(request.priority).push(request.key);
    this.schedule();
    return promise;
  }

  cancel(key: string): void {
    const job = this.jobs.get(key);
    if (!job || this.inFlight.has(key)) return;
    if (job.retryTimer) clearTimeout(job.retryTimer);
    this.removeQueuedKey(this.manual, key);
    this.removeQueuedKey(this.visible, key);
    this.jobs.delete(key);
    job.reject(new Error('Translation request cancelled.'));
  }

  cancelAutoForMessage(key: string): void {
    const job = this.jobs.get(key);
    if (!job || job.request.requestSource !== 'auto') return;
    this.cancel(key);
  }

  hasPending(key: string): boolean {
    return this.jobs.has(key);
  }

  get pendingCount(): number {
    return this.jobs.size;
  }

  private queueFor(priority: RequestPriority): string[] {
    return priority === 'manual' ? this.manual : this.visible;
  }

  private nextKey(): string | undefined {
    return this.manual.shift() ?? this.visible.shift();
  }

  private schedule(): void {
    if (!this.running) return;
    while (this.inFlight.size < this.maxConcurrency) {
      const delay = this.rateLimitDelay();
      if (delay > 0) {
        this.armWake(delay);
        return;
      }
      const key = this.nextKey();
      if (!key) return;
      const job = this.jobs.get(key);
      if (!job || this.inFlight.has(key)) continue;
      this.startJob(job);
    }
  }

  private startJob(job: QueueJob): void {
    const key = job.request.key;
    this.inFlight.add(key);
    this.requestTimes.push(this.now());
    job.attempt += 1;
    this.options.onStart?.(job.request);

    void this.options.execute(job.request).then(
      (result) => {
        this.inFlight.delete(key);
        this.jobs.delete(key);
        job.resolve(result);
        this.schedule();
      },
      (error: QueueError) => {
        this.inFlight.delete(key);
        const retryable = Boolean(error?.retryable);
        if (this.running && retryable && job.attempt < 2) {
          job.retryTimer = setTimeout(() => {
            job.retryTimer = undefined;
            if (!this.jobs.has(key) || !this.running) return;
            this.queueFor(job.request.priority).unshift(key);
            this.schedule();
          }, this.retryDelayMs);
          this.schedule();
          return;
        }
        this.jobs.delete(key);
        job.reject(error);
        this.schedule();
      },
    );
  }

  private rateLimitDelay(): number {
    const now = this.now();
    const windowStart = now - 60_000;
    while (this.requestTimes.length > 0 && this.requestTimes[0] <= windowStart) this.requestTimes.shift();
    if (this.requestTimes.length < this.requestsPerMinute) return 0;
    return Math.max(1, 60_000 - (now - this.requestTimes[0]));
  }

  private armWake(delay: number): void {
    if (this.wakeTimer) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.schedule();
    }, delay);
  }

  private removeQueuedKey(queue: string[], key: string): void {
    const index = queue.indexOf(key);
    if (index >= 0) queue.splice(index, 1);
  }
}

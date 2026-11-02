import { Worker } from 'node:worker_threads';
import type { SearchPage, SearchRequest } from '@partsfinder/contracts';

interface WorkerError {
  code: string;
  statusCode: number;
  message: string;
}

interface PendingSearch {
  resolve: (page: SearchPage) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
}

export class SearchQueueError extends Error {
  readonly code = 'SEARCH_QUEUE_FULL';
  readonly statusCode = 503;
}

export class SearchWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingSearch>();
  private nextId = 1;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private closed = false;
  private readonly ready: Promise<void>;

  constructor(dbPath: string, private readonly maxOutstanding = 64) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
      workerData: { dbPath },
      execArgv: ['--import', 'tsx'],
    });
    this.worker.on('message', (message: { type: string; id?: number; result?: SearchPage; error?: WorkerError; message?: string }) => {
      if (message.type === 'ready') this.resolveReady();
      else if (message.type === 'startupError') this.rejectReady(new Error(message.message ?? 'Search worker failed to start.'));
      else if (message.type === 'result' && message.id !== undefined && message.result) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.cleanup(message.id, pending);
          pending.resolve(message.result);
        }
      } else if (message.type === 'error' && message.id !== undefined && message.error) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.cleanup(message.id, pending);
          const error = new Error(message.error.message) as Error & { code: string; statusCode: number };
          error.code = message.error.code;
          error.statusCode = message.error.statusCode;
          pending.reject(error);
        }
      }
    });
    this.worker.on('error', (error) => {
      this.rejectReady(error);
      for (const [id, pending] of this.pending) {
        this.cleanup(id, pending);
        pending.reject(error);
      }
    });
    this.worker.on('exit', (code) => {
      this.closed = true;
      if (code !== 0) {
        const error = new Error(`Search worker exited with code ${code}.`);
        this.rejectReady(error);
        for (const [id, pending] of this.pending) {
          this.cleanup(id, pending);
          pending.reject(error);
        }
      }
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage> {
    await this.ready;
    if (this.closed) throw new Error('Search worker is closed.');
    if (signal?.aborted) throw new DOMException('Search was cancelled.', 'AbortError');
    if (this.pending.size >= this.maxOutstanding) throw new SearchQueueError('Search queue is full; retry shortly.');
    const id = this.nextId++;
    return new Promise<SearchPage>((resolve, reject) => {
      const pending: PendingSearch = { resolve, reject, ...(signal ? { signal } : {}) };
      if (signal) {
        pending.abort = () => {
          this.cleanup(id, pending);
          this.worker.postMessage({ type: 'cancel', id });
          reject(new DOMException('Search was cancelled.', 'AbortError'));
        };
        signal.addEventListener('abort', pending.abort, { once: true });
      }
      this.pending.set(id, pending);
      this.worker.postMessage({ type: 'search', id, request });
    });
  }

  private cleanup(id: number, pending: PendingSearch): void {
    pending.signal?.removeEventListener('abort', pending.abort as () => void);
    this.pending.delete(id);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const [id, pending] of this.pending) {
      this.cleanup(id, pending);
      pending.reject(new Error('Search worker was closed.'));
    }
    await this.worker.terminate();
  }
}

import type { EntryDetail, SearchPage, SearchRequest, VehicleOption } from '@partsfinder/contracts';
import type { InstallProgress, InstallResult } from './installer.js';

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
  progress?: (value: InstallProgress) => void;
}

interface WorkerStatus {
  activeVersion: string | null;
  ready: boolean;
  state: string;
  rowCount?: number;
  sourceSha256?: string | null;
  importedAt?: string | null;
  currencyUnit?: string;
  priceEffectiveAt?: string | null;
}

export class CatalogueWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingRequest<unknown>>();

  constructor() {
    this.worker = new Worker(new URL('../workers/catalogue.worker.ts', import.meta.url), { type: 'module', name: 'partsfinder-catalogue' });
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as { id?: number; type?: string; result?: unknown; error?: { code?: string; message?: string }; progress?: InstallProgress };
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === 'progress' && message.progress) {
        pending.progress?.(message.progress);
        return;
      }
      this.cleanup(message.id, pending);
      if (message.type === 'error') {
        const messageText = message.error?.message ?? 'Offline catalogue request failed.';
        pending.reject(message.error?.code === 'CANCELLED' ? new DOMException(messageText, 'AbortError') : new Error(messageText));
      }
      else if (message.type === 'result') pending.resolve(message.result);
    });
    this.worker.addEventListener('error', (event) => {
      for (const [id, pending] of this.pending) {
        this.cleanup(id, pending);
        pending.reject(new Error(event.message || 'Offline catalogue worker failed.'));
      }
    });
  }

  status(): Promise<WorkerStatus> {
    return this.request<WorkerStatus>({ type: 'status' });
  }

  install(progress?: (value: InstallProgress) => void, signal?: AbortSignal): Promise<InstallResult> {
    return this.request<InstallResult>({ type: 'install' }, signal, progress, true);
  }

  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage> {
    return this.request<SearchPage>({ type: 'search', request }, signal);
  }

  detail(version: string, entryId: number, signal?: AbortSignal): Promise<EntryDetail> {
    return this.request<EntryDetail>({ type: 'detail', version, entryId }, signal);
  }

  vehicles(version: string, query = '', limit = 80): Promise<VehicleOption[]> {
    return this.request<VehicleOption[]>({ type: 'vehicles', version, query, limit });
  }

  presets(version: string): Promise<Array<{ key: string; label: string; options: VehicleOption[] }>> {
    return this.request<Array<{ key: string; label: string; options: VehicleOption[] }>>({ type: 'presets', version });
  }

  suggestions(version: string, vehicleOptionId: number, query: string, limit = 20, signal?:AbortSignal): Promise<string[]> {
    return this.request<string[]>({ type: 'suggestions', version, vehicleOptionId, query, limit },signal);
  }

  close(): void {
    this.worker.terminate();
    for (const [id, pending] of this.pending) {
      this.cleanup(id, pending);
      pending.reject(new Error('Catalogue worker has been closed.'));
    }
  }

  private request<T>(payload: Record<string, unknown>, signal?: AbortSignal, progress?: (value: InstallProgress) => void, waitForCancellation = false): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Request was cancelled.', 'AbortError'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest<T> = { resolve: resolve as (value: unknown) => void, reject, ...(signal ? { signal } : {}), ...(progress ? { progress } : {}) };
      if (signal) {
        pending.abort = () => {
          this.worker.postMessage({ id, type: 'cancel' });
          if (!waitForCancellation) {
            this.cleanup(id, pending as PendingRequest<unknown>);
            reject(new DOMException('Request was cancelled.', 'AbortError'));
          }
        };
        signal.addEventListener('abort', pending.abort, { once: true });
      }
      this.pending.set(id, pending as PendingRequest<unknown>);
      this.worker.postMessage({ id, ...payload });
    });
  }

  private cleanup(id: number, pending: PendingRequest<unknown>): void {
    pending.signal?.removeEventListener('abort', pending.abort as () => void);
    this.pending.delete(id);
  }
}

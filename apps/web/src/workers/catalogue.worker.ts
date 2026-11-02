/// <reference lib="webworker" />
import type { SearchRequest } from '@partsfinder/contracts';
import { activeCatalogueVersion, catalogueReplica } from '../offline/database.js';
import { installOrUpdateCatalogue, type InstallProgress } from '../offline/installer.js';
import { getOfflineEntryDetail, listOfflinePresets, listOfflineVehicleOptions, searchOffline } from '../offline/search.js';

type WorkerRequest =
  | { id: number; type: 'status' }
  | { id: number; type: 'install' }
  | { id: number; type: 'search'; request: SearchRequest }
  | { id: number; type: 'detail'; version: string; entryId: number }
  | { id: number; type: 'vehicles'; version: string; query?: string; limit?: number }
  | { id: number; type: 'presets'; version: string }
  | { id: number; type: 'suggestions'; version: string; vehicleOptionId: number; query: string; limit?: number }
  | { id: number; type: 'cancel' };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const controllers = new Map<number, AbortController>();

function postError(id: number, error: unknown): void {
  const message = error instanceof Error ? error.message : 'The offline catalogue request failed.';
  const code = error instanceof DOMException && error.name === 'AbortError' ? 'CANCELLED' : 'OFFLINE_REQUEST_FAILED';
  scope.postMessage({ id, type: 'error', error: { code, message } });
}

async function status(): Promise<unknown> {
  await catalogueReplica.open();
  const version = await activeCatalogueVersion();
  if (!version) return { activeVersion: null, ready: false, state: 'empty' };
  const local = await catalogueReplica.catalogVersions.get(version);
  return {
    activeVersion: version,
    ready: local?.status === 'ready',
    state: local?.status ?? 'failed',
    rowCount: local?.rowCount ?? 0,
    sourceSha256: local?.sourceSha256 ?? null,
    importedAt: local?.importedAt ?? null,
    currencyUnit: local?.currencyUnit ?? 'UNKNOWN',
    priceEffectiveAt: local?.priceEffectiveAt ?? null,
  };
}

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    controllers.get(request.id)?.abort();
    return;
  }
  void (async () => {
    if (request.type === 'status') {
      scope.postMessage({ id: request.id, type: 'result', result: await status() });
      return;
    }
    if (request.type === 'install') {
      const controller = new AbortController();
      controllers.set(request.id, controller);
      const reportProgress = (progress: InstallProgress) => scope.postMessage({ id: request.id, type: 'progress', progress });
      try {
        const result = await installOrUpdateCatalogue(controller.signal, reportProgress);
        scope.postMessage({ id: request.id, type: 'result', result });
      } finally {
        controllers.delete(request.id);
      }
      return;
    }
    if (request.type === 'search') {
      const controller = new AbortController();
      controllers.set(request.id, controller);
      try {
        const result = await searchOffline(request.request, controller.signal);
        if (!controller.signal.aborted) scope.postMessage({ id: request.id, type: 'result', result });
      } finally {
        controllers.delete(request.id);
      }
      return;
    }
    if (request.type === 'detail') {
      const result = await getOfflineEntryDetail(request.version, request.entryId);
      scope.postMessage({ id: request.id, type: 'result', result });
      return;
    }
    if (request.type === 'vehicles') {
      const result = await listOfflineVehicleOptions(request.version, request.query, request.limit);
      scope.postMessage({ id: request.id, type: 'result', result });
      return;
    }
    if (request.type === 'presets') {
      const result = await listOfflinePresets(request.version);
      scope.postMessage({ id: request.id, type: 'result', result });
      return;
    }
    if (request.type === 'suggestions') {
      const controller=new AbortController();controllers.set(request.id,controller);
      try {
      const page = await searchOffline({
        catalogVersion: request.version,
        mode: 'vehiclePart', kind: 'name', query: request.query,
        vehicleOptionId: request.vehicleOptionId, groupBy: 'entry', limit: request.limit ?? 20,
      },controller.signal);
      const result = [...new Set(page.items.flatMap((item) => item.type === 'entry' ? [item.partNameRaw] : []))];
      if(!controller.signal.aborted)scope.postMessage({ id: request.id, type: 'result', result });
      }finally{controllers.delete(request.id)}
    }
  })().catch((error: unknown) => postError(request.id, error));
});

scope.addEventListener('messageerror', () => {
  scope.postMessage({ type: 'fatal', error: { code: 'INVALID_WORKER_MESSAGE', message: 'The browser could not read a catalogue message.' } });
});

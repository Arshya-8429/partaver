import type { CatalogueManifest, EntryDetail, SearchPage, SearchRequest, VehicleOption } from '@partsfinder/contracts';
import type { CatalogueWorkerClient } from './offline/worker-client.js';

export async function readJson<T>(path: string, parameters: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(`/api/v1/${path}`, location.origin);
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new Error(error?.error?.code === 'CATALOG_VERSION_UNAVAILABLE' ? 'نسخهٔ درخواستی در دسترس نیست؛ اطلاعات کاتالوگ را دوباره بررسی کنید.' : 'خواندن اطلاعات انجام نشد؛ اتصال و اجرای سرویس را بررسی و دوباره تلاش کنید.');
  }
  return response.json() as Promise<T>;
}

/** Read routing only. The installed Worker owns local search, ranking and data. */
export class Catalogue {
  private localVersion: string | null = null;
  constructor(private readonly worker: CatalogueWorkerClient) {}
  setLocalVersion(version: string | null): void { this.localVersion = version; }
  manifest(): Promise<CatalogueManifest> { return readJson('catalog/manifest', {}, AbortSignal.timeout(8000)); }
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage> {
    if (request.catalogVersion === this.localVersion) return this.worker.search(request, signal);
    if (!navigator.onLine) return Promise.reject(new Error('کاتالوگ آفلاین نصب نشده است؛ برای جست‌وجو به اینترنت وصل شوید.'));
    return readJson('search', { ...request, version: request.catalogVersion, q: request.query }, signal);
  }
  detail(version: string, entryId: number, signal?: AbortSignal): Promise<EntryDetail> {
    return version === this.localVersion ? this.worker.detail(version, entryId, signal) : readJson(`entries/${entryId}`, { version }, signal);
  }
  vehicles(version: string, query = '', limit = 80): Promise<VehicleOption[]> {
    return version === this.localVersion ? this.worker.vehicles(version, query, limit) : readJson('vehicles', { version, q: query, limit });
  }
  presets(version: string): Promise<Array<{ key: string; label: string; options: VehicleOption[] }>> {
    return version === this.localVersion ? this.worker.presets(version) : readJson('presets', { version });
  }
  suggestions(version: string, vehicleOptionId: number, query: string, limit = 20, signal?:AbortSignal): Promise<string[]> {
    return version === this.localVersion ? this.worker.suggestions(version, vehicleOptionId, query, limit, signal) : readJson('parts/suggestions', { version, vehicleOptionId, q: query, limit },signal);
  }
}

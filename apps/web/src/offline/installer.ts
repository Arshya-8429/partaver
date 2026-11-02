import type { SnapshotChunkDescriptor, SnapshotManifest, CatalogueManifest } from '@partsfinder/contracts';
import { catalogueReplica, type CatalogueVersionRecord, type InstallChunkRecord, type SearchDocumentRecord } from './database.js';
import { estimateInstallStorageBytes } from './storage-budget.js';

const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_BATCH_RECORDS = 500;
const LEASE_MS = 30_000;
const TABLE_NAMES = [
  'partNames', 'parts', 'entries', 'models', 'entryModels', 'friendlyLabels', 'aliases', 'replacements',
  'vehicleOptions', 'optionModels', 'presetFamilies', 'presetFamilyOptions', 'searchDocuments', 'entrySearchDocuments',
] as const;
type SnapshotTable = typeof TABLE_NAMES[number];

export type InstallState = 'empty' | 'downloading' | 'importing' | 'indexing' | 'validating' | 'ready' | 'failed';

export interface InstallProgress {
  state: InstallState;
  version: string | null;
  completedChunks: number;
  totalChunks: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

export interface InstallResult {
  version: string;
  unchanged: boolean;
  rowCount: number;
  persistentStorageGranted: boolean | null;
  quota: { usage: number | null; quota: number | null; estimatedInstallBytes: number };
}

export type ProgressSink = (progress: InstallProgress) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function randomOwner(): string {
  return globalThis.crypto.randomUUID();
}

function grams(value: string): string[] {
  const points = [...value];
  const output = new Set<string>();
  for (let index = 0; index <= points.length - 3; index++) output.add(points.slice(index, index + 3).join(''));
  return [...output];
}

function docGramKeys(version: string, row: Record<string, unknown>): string[] {
  const value = row.normalizedValue;
  const kind = row.kind;
  if (typeof value !== 'string' || typeof kind !== 'string') throw new Error('Malformed search-document record in snapshot.');
  return grams(value).map((gram) => `${version}|${kind}|${gram}`);
}

function emit(sink: ProgressSink, state: InstallState, version: string | null, completedChunks: number, totalChunks: number, downloadedBytes: number, totalBytes: number, message: string): void {
  sink({ state, version, completedChunks, totalChunks, downloadedBytes, totalBytes, message });
}

async function acquireLease(owner: string, version: string): Promise<void> {
  await catalogueReplica.transaction('rw', catalogueReplica.installerLease, async () => {
    const current = await catalogueReplica.installerLease.get('catalogue-installer');
    if (current && current.expiresAt > Date.now() && current.owner !== owner) throw new Error('Another browser tab is updating the catalogue.');
    await catalogueReplica.installerLease.put({ key: 'catalogue-installer', owner, version, expiresAt: Date.now() + LEASE_MS, updatedAt: nowIso() });
  });
}

async function renewLease(owner: string, version: string): Promise<void> {
  await catalogueReplica.transaction('rw', catalogueReplica.installerLease, async () => {
    await requireLease(owner, version);
  });
}

// Call only inside the SAME write transaction as the protected mutation.
// The lease table serializes takeover with writes; a suspended owner cannot
// resume and change rows/status after a successor activates the version.
async function requireLease(owner: string, version: string): Promise<void> {
  const current = await catalogueReplica.installerLease.get('catalogue-installer');
  if (!current || current.owner !== owner || current.version !== version || current.expiresAt <= Date.now()) {
    throw new Error('The catalogue update lease expired. Retry the update.');
  }
  await catalogueReplica.installerLease.put({ ...current, expiresAt: Date.now() + LEASE_MS, updatedAt: nowIso() });
}

async function updateStage(owner: string, version: string, status: CatalogueVersionRecord['status']): Promise<void> {
  await catalogueReplica.transaction('rw', catalogueReplica.installerLease, catalogueReplica.catalogVersions, async () => {
    await requireLease(owner, version);
    const current = await catalogueReplica.catalogVersions.get(version);
    if (!current || current.status === 'ready') throw new Error('The staged catalogue was already activated or is unavailable.');
    await catalogueReplica.catalogVersions.update(version, { status });
  });
}

async function releaseLease(owner: string): Promise<void> {
  await catalogueReplica.transaction('rw', catalogueReplica.installerLease, async () => {
    const current = await catalogueReplica.installerLease.get('catalogue-installer');
    if (current?.owner === owner) await catalogueReplica.installerLease.delete('catalogue-installer');
  });
}

function safeManifest(manifest: SnapshotManifest, routeVersion: string): void {
  if (manifest.catalogVersion !== routeVersion || manifest.schemaVersion !== 1 || manifest.normalizationVersion !== 1 || manifest.rulesVersion !== 1 || manifest.indexFormatVersion !== 1) {
    throw new Error('This snapshot uses an unsupported catalogue or index format.');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.sourceSha256) || !Array.isArray(manifest.chunks) || !Number.isSafeInteger(manifest.totalDecodedBytes) || manifest.totalDecodedBytes < 0 || manifest.totalDecodedBytes > MAX_TOTAL_BYTES) {
    throw new Error('Snapshot manifest failed validation or exceeds the 512 MiB install limit.');
  }
  const ids = new Set<string>();
  let declaredBytes = 0;
  for (const chunk of manifest.chunks) {
    if (!/^[a-zA-Z0-9-]{1,96}$/.test(chunk.id) || ids.has(chunk.id)) throw new Error('Snapshot contains a malformed or duplicate chunk ID.');
    ids.add(chunk.id);
    if (!(TABLE_NAMES as readonly string[]).includes(chunk.table)) throw new Error(`Snapshot table is not supported: ${chunk.table}`);
    const expectedPath = `/api/v1/catalog/${routeVersion}/snapshot/chunks/${chunk.id}`;
    if (chunk.path !== expectedPath) throw new Error('Snapshot contains a non-allowlisted chunk path.');
    if (!Number.isSafeInteger(chunk.decodedBytes) || chunk.decodedBytes < 1 || chunk.decodedBytes > MAX_CHUNK_BYTES ||
      !Number.isSafeInteger(chunk.recordCount) || chunk.recordCount < 1 || !/^[a-f0-9]{64}$/.test(chunk.sha256)) {
      throw new Error(`Snapshot chunk descriptor is invalid: ${chunk.id}`);
    }
    if (chunk.recordCount > MAX_BATCH_RECORDS) throw new Error(`Snapshot chunk exceeds the ${MAX_BATCH_RECORDS}-record import batch bound: ${chunk.id}`);
    declaredBytes += chunk.decodedBytes;
  }
  if (declaredBytes !== manifest.totalDecodedBytes) throw new Error('Snapshot declared byte total does not match its chunk list.');
  if (!Number.isSafeInteger(manifest.rowCount) || manifest.rowCount < 1 || Number(manifest.counts.entries) !== manifest.rowCount) {
    throw new Error('Snapshot entry count does not match its declared row count.');
  }
  for (const tableName of TABLE_NAMES) {
    if (!Number.isSafeInteger(Number(manifest.counts[tableName])) || Number(manifest.counts[tableName]) < 0) {
      throw new Error(`Snapshot manifest has an invalid count for ${tableName}.`);
    }
  }
  const chunkTables = new Set(manifest.chunks.map((chunk) => chunk.table));
  for (const tableName of TABLE_NAMES) {
    if (Number(manifest.counts[tableName]) > 0 && !chunkTables.has(tableName)) throw new Error(`Snapshot is missing chunks for ${tableName}.`);
    if (Number(manifest.counts[tableName]) === 0 && chunkTables.has(tableName)) throw new Error(`Snapshot includes unexpected empty-table chunks for ${tableName}.`);
  }
}

async function parseAndVerifyChunk(bytes: ArrayBuffer, descriptor: SnapshotChunkDescriptor): Promise<Record<string, unknown>[]> {
  if (bytes.byteLength !== descriptor.decodedBytes || bytes.byteLength > MAX_CHUNK_BYTES) throw new Error(`Snapshot chunk size mismatch: ${descriptor.id}`);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable; use HTTPS or localhost to install offline data.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== descriptor.sha256) throw new Error(`Snapshot chunk hash mismatch: ${descriptor.id}`);
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const records = decoded.split('\n').filter(Boolean).map((line) => {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Snapshot contains a non-record in ${descriptor.id}.`);
    return value as Record<string, unknown>;
  });
  if (records.length !== descriptor.recordCount) throw new Error(`Snapshot record count mismatch: ${descriptor.id}`);
  return records;
}

function tableFor(table: SnapshotTable) {
  return catalogueReplica.table(table);
}

async function importChunk(owner: string, version: string, descriptor: SnapshotChunkDescriptor, records: Record<string, unknown>[]): Promise<void> {
  const tableName = descriptor.table as SnapshotTable;
  const rows = records.map((record) => {
    if (record.version !== version) throw new Error(`Snapshot record crosses catalogue versions in ${descriptor.id}.`);
    if (tableName === 'searchDocuments') return { ...record, gramKeys: docGramKeys(version, record) } as SearchDocumentRecord;
    return record;
  });
  if (!rows.length) throw new Error(`Snapshot chunk is empty: ${descriptor.id}`);
  const target = tableFor(tableName);
  const chunkMarker: InstallChunkRecord = {
    version,
    chunkId: descriptor.id,
    sha256: descriptor.sha256,
    recordCount: descriptor.recordCount,
    completedAt: nowIso(),
  };
  // Snapshot chunks are capped to 500 records; data and completion marker commit atomically.
  await catalogueReplica.transaction('rw', [target, catalogueReplica.installChunks, catalogueReplica.installerLease, catalogueReplica.catalogVersions], async () => {
    await requireLease(owner, version);
    const current = await catalogueReplica.catalogVersions.get(version);
    if (!current || current.status === 'ready') throw new Error('The staged catalogue was already activated or is unavailable.');
    await target.bulkPut(rows);
    await catalogueReplica.installChunks.put(chunkMarker);
    await catalogueReplica.catalogVersions.update(version, { status: tableName === 'searchDocuments' ? 'indexing' : 'importing' });
  });
}

async function countVersionRows(tableName: SnapshotTable, version: string): Promise<number> {
  return tableFor(tableName).where('version').equals(version).count();
}

async function validateRelationships(version: string): Promise<void> {
  const partIds = new Set<number>();
  await catalogueReplica.parts.where('version').equals(version).each((row) => partIds.add(Number(row.id)));
  const modelIds = new Set<number>();
  await catalogueReplica.models.where('version').equals(version).each((row) => modelIds.add(Number(row.id)));
  const optionIds = new Set<number>();
  await catalogueReplica.vehicleOptions.where('version').equals(version).each((row) => optionIds.add(Number(row.id)));
  const familyKeys = new Set<string>();
  await catalogueReplica.presetFamilies.where('version').equals(version).each((row) => familyKeys.add(String(row.familyKey)));

  let checked = 0;
  await catalogueReplica.entries.where('version').equals(version).each((row) => {
    if (!partIds.has(Number(row.partId))) throw new Error(`Snapshot entry ${String(row.id)} references a missing technical part.`);
    checked++;
  });
  await catalogueReplica.entryModels.where('version').equals(version).each((row) => {
    if (!modelIds.has(Number(row.modelId))) throw new Error(`Snapshot entry ${String(row.entryId)} references a missing vehicle model.`);
  });
  await catalogueReplica.optionModels.where('version').equals(version).each((row) => {
    if (!modelIds.has(Number(row.modelId)) || !optionIds.has(Number(row.optionId))) throw new Error('Snapshot vehicle option contains a missing model or option.');
  });
  await catalogueReplica.presetFamilyOptions.where('version').equals(version).each((row) => {
    if (!familyKeys.has(String(row.familyKey)) || !optionIds.has(Number(row.optionId))) throw new Error('Snapshot preset references a missing family or option.');
  });
  if (checked === 0) throw new Error('Snapshot contains no catalogue entries.');
}

async function activateVersion(owner: string, version: string, record: CatalogueVersionRecord, activeManifestEtag: string | null): Promise<void> {
  await catalogueReplica.transaction('rw', catalogueReplica.meta, catalogueReplica.catalogVersions, catalogueReplica.installerLease, async () => {
    await requireLease(owner, version);
    const current = await catalogueReplica.catalogVersions.get(version);
    if (!current || current.manifestSha256 !== record.manifestSha256) throw new Error('Staged catalogue metadata changed before activation.');
    const readyRecord: CatalogueVersionRecord = { ...current, status: 'ready' };
    delete readyRecord.failure;
    await catalogueReplica.catalogVersions.put({ ...readyRecord, status: 'ready' });
    await catalogueReplica.meta.put({ key: 'activeCatalogVersion', value: version, updatedAt: nowIso() });
    if (activeManifestEtag) await catalogueReplica.meta.put({ key: 'activeManifestEtag', value: activeManifestEtag, updatedAt: nowIso() });
  });
  try {
    const channel = new BroadcastChannel('partsfinder-catalogue');
    channel.postMessage({ type: 'activated', version });
    channel.close();
  } catch { /* IndexedDB remains the source of truth when BroadcastChannel is unavailable. */ }
}

async function getStorageEstimate(requiredBytes: number): Promise<{ persistent: boolean | null; usage: number | null; quota: number | null }> {
  let persistent: boolean | null = null;
  let usage: number | null = null;
  let quota: number | null = null;
  if (navigator.storage?.persist) {
    try { persistent = await navigator.storage.persist(); } catch { persistent = false; }
  }
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usage = estimate.usage ?? null;
      quota = estimate.quota ?? null;
    } catch { /* A denied estimate does not make first-run setup fail by itself. */ }
  }
  const estimatedInstallBytes = estimateInstallStorageBytes(requiredBytes);
  if (quota !== null && usage !== null && quota - usage < estimatedInstallBytes) {
    throw new Error(`Not enough browser storage for a safe update. Estimated browser storage budget is ${estimatedInstallBytes} bytes.`);
  }
  return { persistent, usage, quota };
}

export async function installOrUpdateCatalogue(
  signal: AbortSignal,
  progress: ProgressSink,
  apiBase = '',
): Promise<InstallResult> {
  await catalogueReplica.open();
  const activeVersion = (await catalogueReplica.meta.get('activeCatalogVersion'))?.value?.toString() ?? null;
  const activeEtag = (await catalogueReplica.meta.get('activeManifestEtag'))?.value?.toString();
  const activeRequestHeaders: HeadersInit = activeVersion && activeEtag ? { 'if-none-match': activeEtag } : {};
  emit(progress, 'downloading', activeVersion, 0, 0, 0, 0, 'Checking the catalogue version.');
  const activeResponse = await fetch(`${apiBase}/api/v1/catalog/manifest`, { headers: activeRequestHeaders, signal, cache: 'no-store' });
  if (activeResponse.status === 304 && activeVersion) {
    const local = await catalogueReplica.catalogVersions.get(activeVersion);
    if (local?.status === 'ready') {
      emit(progress, 'ready', activeVersion, 0, 0, 0, 0, 'The offline catalogue is current.');
      return { version: activeVersion, unchanged: true, rowCount: local.rowCount, persistentStorageGranted: null, quota: { usage: null, quota: null, estimatedInstallBytes: 0 } };
    }
    throw new Error('The server reported an unchanged catalogue, but no valid local copy exists.');
  }
  if (!activeResponse.ok) throw new Error(`Catalogue version check failed (${activeResponse.status}).`);
  const activeManifest = await activeResponse.json() as CatalogueManifest;
  const activeManifestEtag = activeResponse.headers.get('etag');
  const version = activeManifest.catalogVersion;
  if (!/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(version) ||
    activeManifest.snapshotManifestPath !== `/api/v1/catalog/${version}/snapshot/manifest` ||
    activeManifest.schemaVersion !== 1 || activeManifest.normalizationVersion !== 1 || activeManifest.rulesVersion !== 1 ||
    activeManifest.indexFormatVersion !== 1 || activeManifest.rowCount < 1 || Number(activeManifest.counts.entries ?? activeManifest.counts.rows) !== activeManifest.rowCount) {
    throw new Error('The server active catalogue manifest is incomplete.');
  }
  const localExisting = await catalogueReplica.catalogVersions.get(version);
  const owner = randomOwner();
  await acquireLease(owner, version);
  let stageRecord: CatalogueVersionRecord | undefined;
  try {
  if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
  if (localExisting?.status === 'ready') {
    const snapshotResponse = await fetch(activeManifest.snapshotManifestPath, { cache: 'no-store', signal });
    if (!snapshotResponse.ok) throw new Error(`Snapshot manifest check failed (${snapshotResponse.status}).`);
    const snapshotBytes = await snapshotResponse.arrayBuffer();
    const snapshotHashBuffer = await crypto.subtle.digest('SHA-256', snapshotBytes);
    const snapshotHash = [...new Uint8Array(snapshotHashBuffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
    if (snapshotHash !== localExisting.manifestSha256) throw new Error('The local ready catalogue does not match the server snapshot manifest.');
    if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
    await activateVersion(owner, version, localExisting, activeManifestEtag);
    emit(progress, 'ready', version, 0, 0, 0, 0, 'A previously installed catalogue version is ready.');
    return { version, unchanged: true, rowCount: localExisting.rowCount, persistentStorageGranted: null, quota: { usage: null, quota: null, estimatedInstallBytes: 0 } };
  }

    if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
    const snapshotUrl = activeManifest.snapshotManifestPath;
    const response = await fetch(snapshotUrl, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`Snapshot manifest download failed (${response.status}).`);
    const snapshotBytes = await response.arrayBuffer();
    if (snapshotBytes.byteLength > 2 * 1024 * 1024) throw new Error('Snapshot manifest is larger than 2 MiB.');
    const manifestDigest = await crypto.subtle.digest('SHA-256', snapshotBytes);
    const manifestSha256 = [...new Uint8Array(manifestDigest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const snapshotManifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(snapshotBytes)) as SnapshotManifest;
    safeManifest(snapshotManifest, version);
    if (snapshotManifest.sourceSha256 !== activeManifest.sourceSha256 || snapshotManifest.rowCount !== activeManifest.rowCount) {
      throw new Error('The snapshot does not match the active catalogue manifest.');
    }
    if (localExisting && localExisting.manifestSha256 !== manifestSha256) throw new Error('The same immutable catalogue version has a different snapshot manifest hash.');

    const storage = await getStorageEstimate(snapshotManifest.totalDecodedBytes);
    stageRecord = {
      version,
      sourceSha256: snapshotManifest.sourceSha256,
      status: 'downloading',
      counts: snapshotManifest.counts,
      rowCount: snapshotManifest.rowCount,
      manifestSha256,
      ...(response.headers.get('etag') ? { etag: response.headers.get('etag') as string } : {}),
      totalDecodedBytes: snapshotManifest.totalDecodedBytes,
      schemaVersion: snapshotManifest.schemaVersion,
      normalizationVersion: snapshotManifest.normalizationVersion,
      rulesVersion: snapshotManifest.rulesVersion,
      currencyUnit: snapshotManifest.currencyUnit,
      priceEffectiveAt: snapshotManifest.priceEffectiveAt,
      importedAt: nowIso(),
    };
    const alreadyReady = await catalogueReplica.transaction('rw', catalogueReplica.installerLease, catalogueReplica.catalogVersions, async () => {
      await requireLease(owner, version);
      const current = await catalogueReplica.catalogVersions.get(version);
      if (current && current.manifestSha256 !== manifestSha256) throw new Error('The same immutable catalogue version has a different snapshot manifest hash.');
      if (current?.status === 'ready') return current;
      await catalogueReplica.catalogVersions.put(stageRecord!);
      return null;
    });
    // Another owner may have completed between the initial read and acquisition.
    if (alreadyReady) {
      if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
      await activateVersion(owner, version, alreadyReady, activeManifestEtag);
      emit(progress, 'ready', version, 0, 0, 0, 0, 'A previously installed catalogue version is ready.');
      return { version, unchanged: true, rowCount: alreadyReady.rowCount, persistentStorageGranted: storage.persistent, quota: { usage: storage.usage, quota: storage.quota, estimatedInstallBytes: 0 } };
    }
    let completedChunks = 0;
    let downloadedBytes = 0;
    emit(progress, 'downloading', version, 0, snapshotManifest.chunks.length, 0, snapshotManifest.totalDecodedBytes, 'Downloading and checking offline data.');

    for (const chunk of snapshotManifest.chunks) {
      if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
      await renewLease(owner, version);
      const completed = await catalogueReplica.installChunks.get([version, chunk.id]);
      if (completed && completed.sha256 === chunk.sha256 && completed.recordCount === chunk.recordCount) {
        completedChunks++;
        downloadedBytes += chunk.decodedBytes;
        continue;
      }
      if (completed) await catalogueReplica.transaction('rw', catalogueReplica.installerLease, catalogueReplica.installChunks, async () => {
        await requireLease(owner, version);
        await catalogueReplica.installChunks.delete([version, chunk.id]);
      });
      const chunkResponse = await fetch(chunk.path, { signal, cache: 'no-store' });
      if (!chunkResponse.ok) throw new Error(`Snapshot chunk ${chunk.id} download failed (${chunkResponse.status}).`);
      const chunkBuffer = await chunkResponse.arrayBuffer();
      const records = await parseAndVerifyChunk(chunkBuffer, chunk);
      if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
      emit(progress, 'importing', version, completedChunks, snapshotManifest.chunks.length, downloadedBytes, snapshotManifest.totalDecodedBytes, `Importing ${chunk.table} data.`);
      await importChunk(owner, version, chunk, records);
      completedChunks++;
      downloadedBytes += chunk.decodedBytes;
      emit(progress, chunk.table === 'searchDocuments' ? 'indexing' : 'importing', version, completedChunks, snapshotManifest.chunks.length, downloadedBytes, snapshotManifest.totalDecodedBytes, `Checked ${completedChunks} of ${snapshotManifest.chunks.length} chunks.`);
      await new Promise<void>((resolveTurn) => setTimeout(resolveTurn, 0));
    }

    await renewLease(owner, version);
    await updateStage(owner, version, 'validating');
    emit(progress, 'validating', version, completedChunks, snapshotManifest.chunks.length, downloadedBytes, snapshotManifest.totalDecodedBytes, 'Checking record counts and relationships.');
    for (const tableName of TABLE_NAMES) {
      await renewLease(owner, version);
      const actual = await countVersionRows(tableName, version);
      const expected = Number(snapshotManifest.counts[tableName] ?? 0);
      if (actual !== expected) throw new Error(`Local ${tableName} count mismatch: ${actual} != ${expected}.`);
    }
    const installedMarkers = await catalogueReplica.installChunks.where('version').equals(version).count();
    if (installedMarkers !== snapshotManifest.chunks.length) throw new Error('Not every snapshot chunk has a verified completion marker.');
    await validateRelationships(version);
    if (signal.aborted) throw new DOMException('Catalogue update cancelled.', 'AbortError');
    stageRecord = { ...stageRecord, status: 'ready' };
    await activateVersion(owner, version, stageRecord, activeManifestEtag);
    emit(progress, 'ready', version, completedChunks, snapshotManifest.chunks.length, downloadedBytes, snapshotManifest.totalDecodedBytes, 'Offline catalogue is ready.');
    return {
      version,
      unchanged: false,
      rowCount: snapshotManifest.rowCount,
      persistentStorageGranted: storage.persistent,
      quota: { usage: storage.usage, quota: storage.quota, estimatedInstallBytes: estimateInstallStorageBytes(snapshotManifest.totalDecodedBytes) },
    };
  } catch (error) {
    if (stageRecord) {
      try {
        await catalogueReplica.transaction('rw', catalogueReplica.installerLease, catalogueReplica.catalogVersions, async () => {
          const lease = await catalogueReplica.installerLease.get('catalogue-installer');
          const current = await catalogueReplica.catalogVersions.get(version);
          if (lease?.owner === owner && lease.version === version && lease.expiresAt > Date.now() && current && current.status !== 'ready') {
            await catalogueReplica.catalogVersions.update(version, { status: 'failed', failure: error instanceof Error ? error.message.slice(0, 240) : 'Catalogue update failed.' });
          }
        });
      } catch { /* Keep the original failure; quota/storage errors must not trigger unsafe cleanup. */ }
    }
    emit(progress, 'failed', version, 0, 0, 0, 0, error instanceof Error ? error.message : 'Catalogue update failed.');
    throw error;
  } finally {
    await releaseLease(owner);
  }
}

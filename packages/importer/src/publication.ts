import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { SnapshotChunkDescriptor, SnapshotManifest } from '@partsfinder/contracts';
import type { LegacyDb, LegacyRow } from '@partsfinder/domain';
import { hashRow } from './hash.js';
import { extractLegacyDb } from './extract-literal.js';
import { defaultDataRoot, defaultDatabasePath, openCatalogueDatabase } from './database.js';
import { verifyCatalogue, type ReconciliationReport } from './verify.js';

export const MAX_SNAPSHOT_CHUNK_BYTES = 512 * 1024;
const MAX_CHUNK_RECORDS = 500;

interface VersionRecord {
  id: string;
  status: string;
  source_sha256: string;
  archive_path: string;
  schema_version: number;
  normalization_version: number;
  rules_version: number;
  currency_unit: 'UNKNOWN' | 'IRR' | 'TOMAN';
  price_effective_at: string | null;
  created_at: string;
  counts_json: string;
}

export interface PublicationReport {
  versionId: string;
  previousVersionId: string | null;
  activeVersionId: string;
  status: 'published';
  snapshotDirectory: string;
  snapshotManifestPath: string;
  snapshotManifestSha256: string;
  snapshotBytes: number;
  chunkCount: number;
  roundTripRowsVerified: number;
  alreadyPublished: boolean;
  sourceVerification: ReconciliationReport;
}

export interface RollbackReport {
  versionId: string;
  previousVersionId: string | null;
  activeVersionId: string;
  action: 'rollback' | 'already-active';
  snapshotManifestSha256: string;
}

interface ExportTable {
  name: string;
  sql: string;
}

const EXPORT_TABLES: readonly ExportTable[] = [
  { name: 'partNames', sql: 'SELECT id, version_id AS version, name_raw AS nameRaw, name_norm AS nameNorm, name_sort_rank AS sortRank FROM part_names WHERE version_id=? ORDER BY id' },
  { name: 'parts', sql: `SELECT p.id, p.version_id AS version, p.tech_raw AS techRaw, p.tech_norm AS techNorm,
      p.name_id AS nameId, p.tech_sort_rank AS sortRank, COALESCE(cf.display_root,p.tech_raw) AS familyRoot,
      COALESCE(cf.variant_label,'BASE') AS familyVariant, COALESCE(cf.verified,0) AS familyVerified
    FROM parts p LEFT JOIN code_family_members cf ON cf.version_id=p.version_id AND cf.part_id=p.id
    WHERE p.version_id=? ORDER BY p.id` },
  { name: 'entries', sql: `SELECT id, version_id AS version, part_id AS partId, log_raw AS logRaw, log_norm AS logNorm,
      CAST(base_price AS TEXT) AS basePrice, replacement_raw AS replacementRaw, source_row_ordinal AS sourceRowOrdinal,
      source_row_sha256 AS sourceRowSha256, suffix01_rank AS suffix01Rank
    FROM catalog_entries WHERE version_id=? ORDER BY source_row_ordinal` },
  { name: 'models', sql: 'SELECT id, version_id AS version, name_raw AS nameRaw, name_norm AS nameNorm FROM vehicle_models WHERE version_id=? ORDER BY id' },
  { name: 'entryModels', sql: 'SELECT version_id AS version, entry_id AS entryId, ordinal, model_id AS modelId FROM entry_vehicle_models WHERE version_id=? ORDER BY entry_id, ordinal' },
  { name: 'friendlyLabels', sql: 'SELECT version_id AS version, entry_id AS entryId, ordinal, label_raw AS labelRaw, label_norm AS labelNorm FROM entry_friendly_labels WHERE version_id=? ORDER BY entry_id, ordinal' },
  { name: 'aliases', sql: 'SELECT version_id AS version, entry_id AS entryId, ordinal, alias_raw AS aliasRaw, alias_norm AS aliasNorm FROM entry_aliases WHERE version_id=? ORDER BY entry_id, ordinal' },
  { name: 'replacements', sql: 'SELECT version_id AS version, entry_id AS entryId, ordinal, token_raw AS tokenRaw, token_norm AS tokenNorm, target_part_id AS targetPartId FROM entry_replacements WHERE version_id=? ORDER BY entry_id, ordinal' },
  { name: 'vehicleOptions', sql: `SELECT id, version_id AS version, option_kind AS kind, label_raw AS labelRaw, label_norm AS labelNorm,
      keywords_raw AS keywordsRaw, keywords_norm AS keywordsNorm, display_order AS displayOrder,
      source_option_ordinal AS sourceOptionOrdinal, canonicalization_provenance AS provenance
    FROM vehicle_options WHERE version_id=? ORDER BY option_kind, display_order` },
  { name: 'optionModels', sql: 'SELECT version_id AS version, option_id AS optionId, ordinal, model_id AS modelId FROM vehicle_option_models WHERE version_id=? ORDER BY option_id, ordinal' },
  { name: 'presetFamilies', sql: 'SELECT version_id AS version, family_key AS familyKey, label_raw AS labelRaw, display_order AS displayOrder FROM preset_families WHERE version_id=? ORDER BY display_order' },
  { name: 'presetFamilyOptions', sql: 'SELECT version_id AS version, family_key AS familyKey, option_id AS optionId, display_order AS displayOrder FROM preset_family_options WHERE version_id=? ORDER BY family_key, display_order' },
  { name: 'searchDocuments', sql: 'SELECT id, version_id AS version, kind, raw_value AS rawValue, normalized_value AS normalizedValue FROM search_documents WHERE version_id=? ORDER BY id' },
  { name: 'entrySearchDocuments', sql: 'SELECT version_id AS version, entry_id AS entryId, doc_id AS docId FROM entry_search_documents WHERE version_id=? ORDER BY entry_id, doc_id' },
];

function fileHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function yieldTurn(): Promise<void> {
  await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
}

function readVersion(db: Database.Database, versionId: string): VersionRecord {
  const version = db.prepare(`
    SELECT id, status, source_sha256, archive_path, schema_version, normalization_version, rules_version,
      currency_unit, price_effective_at, created_at, counts_json
    FROM catalog_versions WHERE id=?
  `).get(versionId) as VersionRecord | undefined;
  if (!version) throw new Error(`Unknown catalogue version: ${versionId}`);
  return version;
}

async function writeTableChunks(db: Database.Database, version: VersionRecord, stagingDirectory: string): Promise<{
  chunks: SnapshotChunkDescriptor[];
  counts: Record<string, number>;
}> {
  const chunks: SnapshotChunkDescriptor[] = [];
  const counts: Record<string, number> = {};
  for (const table of EXPORT_TABLES) {
    let buffer = Buffer.alloc(0);
    let chunkCount = 0;
    let ordinal = 0;
    let totalRecords = 0;
    const flush = async () => {
      if (!chunkCount) return;
      const digest = fileHash(buffer);
      const id = `${table.name}-${String(ordinal).padStart(5, '0')}-${digest.slice(0, 16)}`;
      const relativePath = `${id}.ndjson`;
      await writeFile(join(stagingDirectory, relativePath), buffer, { flag: 'wx' });
      chunks.push({
        id,
        path: `/api/v1/catalog/${version.id}/snapshot/chunks/${id}`,
        table: table.name,
        ordinal,
        recordCount: chunkCount,
        decodedBytes: buffer.byteLength,
        sha256: digest,
      });
      ordinal++;
      buffer = Buffer.alloc(0);
      chunkCount = 0;
      await yieldTurn();
    };

    const statement = db.prepare(table.sql);
    for (const record of statement.iterate(version.id) as IterableIterator<Record<string, unknown>>) {
      const line = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
      if (line.byteLength > MAX_SNAPSHOT_CHUNK_BYTES) throw new Error(`Snapshot record in ${table.name} exceeds the decoded chunk limit`);
      if (buffer.byteLength + line.byteLength > MAX_SNAPSHOT_CHUNK_BYTES || chunkCount >= MAX_CHUNK_RECORDS) await flush();
      buffer = Buffer.concat([buffer, line]);
      chunkCount++;
      totalRecords++;
    }
    await flush();
    counts[table.name] = totalRecords;
  }
  return { chunks, counts };
}

function expectedTableCounts(db: Database.Database, version: string): Record<string, number> {
  const tables: Record<string, string> = {
    partNames: 'part_names', parts: 'parts', entries: 'catalog_entries', models: 'vehicle_models',
    entryModels: 'entry_vehicle_models', friendlyLabels: 'entry_friendly_labels', aliases: 'entry_aliases',
    replacements: 'entry_replacements', vehicleOptions: 'vehicle_options', optionModels: 'vehicle_option_models',
    presetFamilies: 'preset_families', presetFamilyOptions: 'preset_family_options', searchDocuments: 'search_documents',
    entrySearchDocuments: 'entry_search_documents',
  };
  return Object.fromEntries(Object.entries(tables).map(([name, table]) => {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE version_id=?`).get(version) as { count: number };
    return [name, count.count];
  }));
}

async function verifySnapshotFiles(directory: string, manifest: SnapshotManifest): Promise<number> {
  const observedCounts: Record<string, number> = {};
  let totalBytes = 0;
  const seenIds = new Set<string>();
  for (const chunk of manifest.chunks) {
    if (!/^[a-zA-Z0-9-]+$/.test(chunk.id) || seenIds.has(chunk.id) || chunk.decodedBytes > MAX_SNAPSHOT_CHUNK_BYTES) {
      throw new Error(`Invalid or duplicate snapshot chunk descriptor: ${chunk.id}`);
    }
    seenIds.add(chunk.id);
    const bytes = await readFile(join(directory, `${chunk.id}.ndjson`));
    if (bytes.byteLength !== chunk.decodedBytes || fileHash(bytes) !== chunk.sha256) throw new Error(`Snapshot chunk hash or byte count mismatch: ${chunk.id}`);
    const lines = bytes.toString('utf8').split('\n').filter(Boolean);
    if (lines.length !== chunk.recordCount) throw new Error(`Snapshot chunk record count mismatch: ${chunk.id}`);
    for (const line of lines) {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Snapshot chunk contains a non-record: ${chunk.id}`);
    }
    observedCounts[chunk.table] = (observedCounts[chunk.table] ?? 0) + lines.length;
    totalBytes += bytes.byteLength;
    await yieldTurn();
  }
  if (totalBytes !== manifest.totalDecodedBytes) throw new Error('Snapshot total decoded byte count does not match its manifest');
  for (const [table, expected] of Object.entries(manifest.counts)) {
    if ((observedCounts[table] ?? 0) !== expected) throw new Error(`Snapshot table count mismatch for ${table}: ${observedCounts[table] ?? 0} != ${expected}`);
  }
  return totalBytes;
}

interface SnapshotEntry {
  id: number;
  partId: number;
  logRaw: string;
  basePrice: string;
  replacementRaw: string;
  sourceRowOrdinal: number;
}

interface SnapshotPart { id: number; techRaw: string; nameId: number; }
interface SnapshotName { id: number; nameRaw: string; }
interface SnapshotModel { id: number; nameRaw: string; }
interface SnapshotRelation { entryId: number; ordinal: number; modelId?: number; labelRaw?: string; aliasRaw?: string; }

async function verifyOfflineRowRoundTrip(directory: string, manifest: SnapshotManifest, source: LegacyDb): Promise<number> {
  const entries = new Map<number, SnapshotEntry>();
  const parts = new Map<number, SnapshotPart>();
  const names = new Map<number, SnapshotName>();
  const models = new Map<number, SnapshotModel>();
  const entryModels = new Map<number, SnapshotRelation[]>();
  const friendly = new Map<number, SnapshotRelation[]>();
  const aliases = new Map<number, SnapshotRelation[]>();

  for (const chunk of manifest.chunks) {
    if (!['entries', 'parts', 'partNames', 'models', 'entryModels', 'friendlyLabels', 'aliases'].includes(chunk.table)) continue;
    const content = await readFile(join(directory, `${chunk.id}.ndjson`), 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      const item = JSON.parse(line) as Record<string, unknown>;
      if (chunk.table === 'entries') entries.set(Number(item.id), item as unknown as SnapshotEntry);
      else if (chunk.table === 'parts') parts.set(Number(item.id), item as unknown as SnapshotPart);
      else if (chunk.table === 'partNames') names.set(Number(item.id), item as unknown as SnapshotName);
      else if (chunk.table === 'models') models.set(Number(item.id), item as unknown as SnapshotModel);
      else if (chunk.table === 'entryModels' || chunk.table === 'friendlyLabels' || chunk.table === 'aliases') {
        const relation = item as unknown as SnapshotRelation;
        const target = chunk.table === 'entryModels' ? entryModels : chunk.table === 'friendlyLabels' ? friendly : aliases;
        const list = target.get(relation.entryId) ?? [];
        list.push(relation);
        target.set(relation.entryId, list);
      }
    }
  }
  for (const values of [entryModels, friendly, aliases]) {
    for (const relations of values.values()) relations.sort((left, right) => left.ordinal - right.ordinal);
  }
  if (entries.size !== source.rows.length) throw new Error(`Snapshot contains ${entries.size} entries, expected ${source.rows.length}`);

  const byOrdinal = [...entries.values()].sort((left, right) => left.sourceRowOrdinal - right.sourceRowOrdinal);
  for (const [index, entry] of byOrdinal.entries()) {
    const original = source.rows[index];
    const part = parts.get(entry.partId);
    const name = part ? names.get(part.nameId) : undefined;
    if (!original || !part || !name) throw new Error(`Snapshot row ${index + 1} has a missing part or name reference`);
    const rawPrice = Number(entry.basePrice);
    if (!Number.isSafeInteger(rawPrice) || String(rawPrice) !== entry.basePrice) throw new Error(`Snapshot price at row ${index + 1} cannot be represented exactly by the source format`);
    const modelNames = (entryModels.get(entry.id) ?? []).map((relation) => {
      const model = models.get(relation.modelId ?? -1);
      if (!model) throw new Error(`Snapshot row ${index + 1} has a missing model reference`);
      return model.nameRaw;
    });
    const restored: LegacyRow = {
      part: name.nameRaw,
      models: modelNames,
      tech: part.techRaw,
      log: entry.logRaw,
      price: rawPrice,
      replacement: entry.replacementRaw,
      friendly: (friendly.get(entry.id) ?? []).map((relation) => relation.labelRaw ?? ''),
      aliases: (aliases.get(entry.id) ?? []).map((relation) => relation.aliasRaw ?? ''),
    };
    if (hashRow(restored) !== hashRow(original)) throw new Error(`Snapshot row field reconciliation failed at source row ${index + 1}`);
    await yieldTurn();
  }
  return byOrdinal.length;
}

async function loadExistingManifest(db: Database.Database, version: string): Promise<{ manifest: SnapshotManifest; hash: string; relativePath: string } | undefined> {
  const row = db.prepare('SELECT manifest_json, manifest_sha256, relative_path FROM catalog_snapshots WHERE version_id=?').get(version) as { manifest_json: string; manifest_sha256: string; relative_path: string } | undefined;
  if (!row) return undefined;
  return { manifest: JSON.parse(row.manifest_json) as SnapshotManifest, hash: row.manifest_sha256, relativePath: row.relative_path };
}

async function persistSnapshot(db: Database.Database, version: VersionRecord, manifest: SnapshotManifest, manifestHash: string, directory: string, snapshotRoot: string): Promise<void> {
  const finalDirectory = join(snapshotRoot, version.id);
  const existingDirectory = await stat(finalDirectory).then(() => true).catch(() => false);
  if (existingDirectory) {
    const existingBytes = await readFile(join(finalDirectory, 'manifest.json'));
    if (fileHash(existingBytes) !== manifestHash) throw new Error(`An incompatible snapshot directory already exists for ${version.id}`);
    await verifySnapshotFiles(finalDirectory, manifest);
    await rm(directory, { recursive: true, force: true });
  } else {
    await rename(directory, finalDirectory);
  }

  const relativePath = `${version.id}/manifest.json`;
  const priorVersion = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null }).active_version_id;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO catalog_snapshots(version_id, manifest_json, manifest_sha256, relative_path, total_decoded_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(version_id) DO UPDATE SET
        manifest_json=excluded.manifest_json, manifest_sha256=excluded.manifest_sha256,
        relative_path=excluded.relative_path, total_decoded_bytes=excluded.total_decoded_bytes`)
      .run(version.id, JSON.stringify(manifest), manifestHash, relativePath, manifest.totalDecodedBytes, now);
    db.prepare('DELETE FROM catalog_snapshot_chunks WHERE version_id=?').run(version.id);
    const insert = db.prepare(`INSERT INTO catalog_snapshot_chunks(version_id, chunk_id, relative_path, table_name, ordinal, record_count, decoded_bytes, sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const chunk of manifest.chunks) insert.run(version.id, chunk.id, `${version.id}/${chunk.id}.ndjson`, chunk.table, chunk.ordinal, chunk.recordCount, chunk.decodedBytes, chunk.sha256);
    db.prepare("UPDATE catalog_versions SET status='validated' WHERE id=? AND status='staging'").run(version.id);
    db.prepare("UPDATE catalog_versions SET status='published', published_at=COALESCE(published_at, ?) WHERE id=? AND status='validated'").run(now, version.id);
    db.prepare('UPDATE catalog_state SET active_version_id=? WHERE singleton=1').run(version.id);
    db.prepare("INSERT INTO catalog_publication_events(version_id, prior_version_id, action, occurred_at) VALUES (?, ?, 'publish', ?)")
      .run(version.id, priorVersion, now);
  }).immediate();
}

export async function publishCatalogue(versionId: string, options: { dbPath?: string; dataRoot?: string } = {}): Promise<PublicationReport> {
  const dbPath = resolve(options.dbPath ?? defaultDatabasePath());
  const dataRoot = resolve(options.dataRoot ?? defaultDataRoot());
  const snapshotRoot = join(dataRoot, 'snapshots');
  await mkdir(snapshotRoot, { recursive: true });
  const db = openCatalogueDatabase(dbPath);
  let stagingDirectory = '';
  try {
    const version = readVersion(db, versionId);
    if (!['validated', 'published'].includes(version.status)) throw new Error(`Catalogue version must be validated before publish (current status: ${version.status})`);
    const existing = await loadExistingManifest(db, versionId);
    if (version.status === 'published' && existing) {
      const finalDirectory = join(snapshotRoot, versionId);
      const manifestBytes = await readFile(join(finalDirectory, 'manifest.json'));
      if (fileHash(manifestBytes) !== existing.hash) throw new Error('Published snapshot manifest hash changed on disk');
      await verifySnapshotFiles(finalDirectory, existing.manifest);
      const activeVersionId = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null }).active_version_id;
      if (activeVersionId !== versionId) throw new Error('Published version is not active; use the rollback command to switch versions');
      const verification = await verifyCatalogue(versionId, { dbPath, sourcePath: version.archive_path });
      return {
        versionId, previousVersionId: null, activeVersionId: versionId, status: 'published', snapshotDirectory: finalDirectory,
        snapshotManifestPath: join(finalDirectory, 'manifest.json'), snapshotManifestSha256: existing.hash,
        snapshotBytes: existing.manifest.totalDecodedBytes, chunkCount: existing.manifest.chunks.length,
        roundTripRowsVerified: existing.manifest.rowCount, alreadyPublished: true, sourceVerification: verification,
      };
    }

    const verification = await verifyCatalogue(versionId, { dbPath, sourcePath: version.archive_path });
    if (!verification.fullDatabaseHashMatch || verification.rowHashMismatches || verification.storedRowHashMismatches ||
      verification.foreignKeyViolations || verification.integrityCheck !== 'ok' || verification.priceRoundingDifferences) {
      throw new Error(`Source-to-database verification failed before snapshot export: ${JSON.stringify(verification)}`);
    }

    stagingDirectory = await mkdtemp(join(snapshotRoot, `.staging-${versionId}-`));
    const exported = await writeTableChunks(db, version, stagingDirectory);
    const expectedCounts = expectedTableCounts(db, versionId);
    if (JSON.stringify(exported.counts) !== JSON.stringify(expectedCounts)) throw new Error('Snapshot exporter record counts differ from normalized database tables');
    const counts = JSON.parse(version.counts_json) as Record<string, number | string>;
    const totalDecodedBytes = exported.chunks.reduce((sum, chunk) => sum + chunk.decodedBytes, 0);
    const manifest: SnapshotManifest = {
      catalogVersion: version.id,
      schemaVersion: version.schema_version,
      normalizationVersion: version.normalization_version,
      rulesVersion: version.rules_version,
      indexFormatVersion: 1,
      sourceSha256: version.source_sha256,
      currencyUnit: version.currency_unit,
      priceEffectiveAt: version.price_effective_at,
      createdAt: new Date().toISOString(),
      counts: exported.counts,
      rowCount: Number(counts.rows ?? 0),
      totalDecodedBytes,
      chunks: exported.chunks,
    };
    const verifiedBytes = await verifySnapshotFiles(stagingDirectory, manifest);
    if (verifiedBytes !== totalDecodedBytes) throw new Error('Offline snapshot file verification failed');
    const originalSource = extractLegacyDb(await readFile(version.archive_path, 'utf8'));
    const roundTripRowsVerified = await verifyOfflineRowRoundTrip(stagingDirectory, manifest, originalSource);
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(join(stagingDirectory, 'manifest.json'), manifestBytes, { flag: 'wx' });
    const manifestHash = fileHash(manifestBytes);

    const previousVersionId = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null }).active_version_id;
    await persistSnapshot(db, version, manifest, manifestHash, stagingDirectory, snapshotRoot);
    stagingDirectory = '';
    return {
      versionId, previousVersionId, activeVersionId: versionId, status: 'published',
      snapshotDirectory: join(snapshotRoot, versionId), snapshotManifestPath: join(snapshotRoot, versionId, 'manifest.json'),
      snapshotManifestSha256: manifestHash, snapshotBytes: totalDecodedBytes, chunkCount: manifest.chunks.length,
      roundTripRowsVerified, alreadyPublished: false, sourceVerification: verification,
    };
  } catch (error) {
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    db.close();
  }
}

async function verifyPublishedSnapshot(db: Database.Database, version: string, snapshotRoot: string): Promise<{ manifest: SnapshotManifest; hash: string }> {
  const stored = await loadExistingManifest(db, version);
  if (!stored) throw new Error(`Catalogue version ${version} has no verified offline snapshot`);
  const directory = join(snapshotRoot, version);
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  if (fileHash(manifestBytes) !== stored.hash) throw new Error('Snapshot manifest hash does not match the database record');
  const parsed = JSON.parse(manifestBytes.toString('utf8')) as SnapshotManifest;
  if (parsed.catalogVersion !== version) throw new Error('Snapshot manifest is pinned to a different version');
  await verifySnapshotFiles(directory, parsed);
  return { manifest: parsed, hash: stored.hash };
}

export async function rollbackCatalogue(versionId: string, options: { dbPath?: string; dataRoot?: string } = {}): Promise<RollbackReport> {
  if (!/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(versionId)) throw new Error('Malformed catalogue version identifier');
  const dbPath = resolve(options.dbPath ?? defaultDatabasePath());
  const snapshotRoot = join(resolve(options.dataRoot ?? defaultDataRoot()), 'snapshots');
  const db = openCatalogueDatabase(dbPath);
  try {
    const version = readVersion(db, versionId);
    if (version.status !== 'published') throw new Error(`Rollback target is not a published version: ${versionId}`);
    const { hash } = await verifyPublishedSnapshot(db, versionId, snapshotRoot);
    const previousVersionId = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null }).active_version_id;
    if (previousVersionId === versionId) return { versionId, previousVersionId, activeVersionId: versionId, action: 'already-active', snapshotManifestSha256: hash };
    db.transaction(() => {
      db.prepare('UPDATE catalog_state SET active_version_id=? WHERE singleton=1').run(versionId);
      db.prepare("INSERT INTO catalog_publication_events(version_id, prior_version_id, action, occurred_at) VALUES (?, ?, 'rollback', ?)")
        .run(versionId, previousVersionId, new Date().toISOString());
    }).immediate();
    return { versionId, previousVersionId, activeVersionId: versionId, action: 'rollback', snapshotManifestSha256: hash };
  } finally {
    db.close();
  }
}

export async function readSnapshotManifest(db: Database.Database, versionId: string, dataRoot = defaultDataRoot()): Promise<SnapshotManifest> {
  if (!/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(versionId)) throw new Error('Malformed catalogue version identifier');
  const row = db.prepare('SELECT manifest_json, manifest_sha256 FROM catalog_snapshots WHERE version_id=?').get(versionId) as { manifest_json: string; manifest_sha256: string } | undefined;
  if (!row) throw new Error(`Catalogue version ${versionId} does not have a published snapshot`);
  if (fileHash(Buffer.from(row.manifest_json)) !== row.manifest_sha256) {
    // DB JSON is compact; the on-disk pretty manifest hash is verified by verifyPublishedSnapshot.
    const path = resolve(dataRoot, 'snapshots', versionId, 'manifest.json');
    const disk = await readFile(path);
    if (fileHash(disk) !== row.manifest_sha256) throw new Error('Snapshot manifest hash validation failed');
    return JSON.parse(disk.toString('utf8')) as SnapshotManifest;
  }
  return JSON.parse(row.manifest_json) as SnapshotManifest;
}

export async function readSnapshotChunk(db: Database.Database, versionId: string, chunkId: string, dataRoot = defaultDataRoot()): Promise<{ bytes: Buffer; sha256: string; contentLength: number }> {
  if (!/^[a-zA-Z0-9-]{1,96}$/.test(chunkId)) throw new Error('Malformed snapshot chunk identifier');
  const row = db.prepare('SELECT relative_path, sha256, decoded_bytes FROM catalog_snapshot_chunks WHERE version_id=? AND chunk_id=?').get(versionId, chunkId) as { relative_path: string; sha256: string; decoded_bytes: number } | undefined;
  if (!row) throw new Error('Snapshot chunk was not found');
  const root = resolve(dataRoot, 'snapshots');
  const path = resolve(root, row.relative_path);
  const rel = relative(root, path);
  if (rel.startsWith('..') || rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Snapshot chunk path is outside the snapshot directory');
  const bytes = await readFile(path);
  if (bytes.byteLength !== row.decoded_bytes || fileHash(bytes) !== row.sha256) throw new Error('Snapshot chunk failed hash verification');
  return { bytes, sha256: row.sha256, contentLength: row.decoded_bytes };
}

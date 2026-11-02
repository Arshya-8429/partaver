import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import type { SnapshotManifest } from '../../packages/contracts/src/index.js';
import type { LegacyRow } from '../../packages/domain/src/index.js';
import { extractLegacyDb } from '../../packages/importer/src/extract-literal.js';
import { hashRow } from '../../packages/importer/src/hash.js';
import type { ReconciliationReport } from '../../packages/importer/src/verify.js';
import { archiveCommand, assertAbsent, assertRequiredFiles, containedPath, digestFile, isMain, regularFiles, RELEASE_FORMAT, writeReport, type ReleaseManifest, type ReleaseSource } from './common.js';

const run = promisify(execFile);
const SNAPSHOT_TABLES: Record<string, string> = {
  partNames: 'part_names', parts: 'parts', entries: 'catalog_entries', models: 'vehicle_models', entryModels: 'entry_vehicle_models',
  friendlyLabels: 'entry_friendly_labels', aliases: 'entry_aliases', replacements: 'entry_replacements', vehicleOptions: 'vehicle_options',
  optionModels: 'vehicle_option_models', presetFamilies: 'preset_families', presetFamilyOptions: 'preset_family_options',
  searchDocuments: 'search_documents', entrySearchDocuments: 'entry_search_documents',
};

export interface ReleaseVerification {
  format: 'partavar-release-verification-v1';
  fileHashesVerified: true;
  fileCount: number;
  totalFileBytes: number;
  databaseCount: number;
  activeVersionId: string;
  sourceVersionsVerified: number;
  sourceRowsVerified: number;
  snapshotChunksVerified: number;
  snapshotRowsVerified: number;
  historicalSourcesVerified: number;
  integrityCheck: 'ok';
  foreignKeyViolations: 0;
  archiveSha256?: string;
}

function validateManifest(manifest: ReleaseManifest): void {
  if (manifest.format !== RELEASE_FORMAT || !Array.isArray(manifest.files) || !Array.isArray(manifest.sources) || !Array.isArray(manifest.databases) ||
    manifest.fileCount !== manifest.files.length || !manifest.activeVersionId || !manifest.sources.length) throw new Error('Release manifest is malformed or unsupported');
  const paths = new Set<string>();
  for (const file of manifest.files) {
    containedPath('/release', file.path);
    if (paths.has(file.path) || file.path === 'release-manifest.json' || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid or duplicate release file record: ${file.path}`);
    if (file.path.split('/').includes('node_modules') || /(?:-wal|-shm|-journal)$/.test(file.path)) throw new Error(`Transient file in release inventory: ${file.path}`);
    paths.add(file.path);
  }
  if (manifest.files.reduce((sum, file) => sum + file.bytes, 0) !== manifest.totalFileBytes) throw new Error('Release total byte count does not match inventory');
  if (new Set(manifest.databases).size !== manifest.databases.length || !manifest.databases.includes('private-data/sqlite/catalogue.db') ||
      manifest.databases.some(path => !paths.has(path) || !/^private-data\/sqlite\/[^/]+\.db$/.test(path))) throw new Error('Release database inventory is invalid');
  if (manifest.files.filter(file => file.path.endsWith('.db')).length !== manifest.databases.length) throw new Error('Release contains an unverified database');
  if (new Set(manifest.sources.map(source => source.versionId)).size !== manifest.sources.length) throw new Error('Duplicate release source mapping');
  for (const source of manifest.sources) {
    if (!paths.has(source.path) || !/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(source.versionId)) throw new Error('Release source mapping is malformed');
  }
}

async function verifySnapshot(root: string, db: Database.Database, source: ReleaseSource): Promise<{ chunks: number; rows: number }> {
  const snapshot = db.prepare('SELECT manifest_sha256, manifest_json, relative_path FROM catalog_snapshots WHERE version_id=?').get(source.versionId) as { manifest_sha256: string; manifest_json: string; relative_path: string } | undefined;
  if (!snapshot) {
    if (source.status === 'published') throw new Error(`Published catalogue has no snapshot: ${source.versionId}`);
    return { chunks: 0, rows: 0 };
  }
  const manifestPath = containedPath(root, `private-data/snapshots/${snapshot.relative_path}`);
  if ((await digestFile(manifestPath)).sha256 !== snapshot.manifest_sha256) throw new Error(`Snapshot manifest hash mismatch: ${source.versionId}`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SnapshotManifest;
  if (manifest.catalogVersion !== source.versionId || JSON.stringify(manifest) !== snapshot.manifest_json || manifest.sourceSha256 !== source.sha256 || !Array.isArray(manifest.chunks)) throw new Error(`Snapshot manifest differs from the catalogue database: ${source.versionId}`);
  const descriptors = db.prepare('SELECT chunk_id, relative_path, table_name, ordinal, record_count, decoded_bytes, sha256 FROM catalog_snapshot_chunks WHERE version_id=?').all(source.versionId) as Array<{ chunk_id: string; relative_path: string; table_name: string; ordinal: number; record_count: number; decoded_bytes: number; sha256: string }>;
  const byId = new Map(descriptors.map(chunk => [chunk.chunk_id, chunk]));
  if (byId.size !== manifest.chunks.length) throw new Error('Snapshot manifest chunk inventory differs from the database');
  const counts: Record<string, number> = {};
  const records = new Map<string, Array<Record<string, unknown>>>();
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const chunk of manifest.chunks) {
    const stored = byId.get(chunk.id);
    if (!stored || seen.has(chunk.id) || !/^[a-zA-Z0-9-]{1,96}$/.test(chunk.id) || !SNAPSHOT_TABLES[chunk.table] ||
        stored.relative_path !== `${source.versionId}/${chunk.id}.ndjson` || stored.table_name !== chunk.table || stored.ordinal !== chunk.ordinal ||
        stored.record_count !== chunk.recordCount || stored.decoded_bytes !== chunk.decodedBytes || stored.sha256 !== chunk.sha256 || chunk.decodedBytes > 512 * 1024 ||
        chunk.path !== `/api/v1/catalog/${source.versionId}/snapshot/chunks/${chunk.id}`) throw new Error(`Snapshot chunk descriptor mismatch: ${chunk.id}`);
    seen.add(chunk.id);
    const path = containedPath(root, `private-data/snapshots/${stored.relative_path}`);
    const actual = await digestFile(path);
    if (actual.bytes !== chunk.decodedBytes || actual.sha256 !== chunk.sha256) throw new Error(`Snapshot chunk checksum or byte count mismatch: ${chunk.id}`);
    const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
    if (lines.length !== chunk.recordCount) throw new Error(`Snapshot chunk record count mismatch: ${chunk.id}`);
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (!record || typeof record !== 'object' || Array.isArray(record) || record.version !== source.versionId) throw new Error(`Snapshot record version mismatch: ${chunk.id}`);
      if (['entries', 'parts', 'partNames', 'models', 'entryModels', 'friendlyLabels', 'aliases'].includes(chunk.table)) {
        const list = records.get(chunk.table) ?? [];
        list.push(record);
        records.set(chunk.table, list);
      }
    }
    counts[chunk.table] = (counts[chunk.table] ?? 0) + lines.length;
    totalBytes += actual.bytes;
  }
  if (totalBytes !== manifest.totalDecodedBytes || Object.keys(manifest.counts).length !== Object.keys(SNAPSHOT_TABLES).length) throw new Error('Snapshot totals do not match its manifest');
  for (const [name, table] of Object.entries(SNAPSHOT_TABLES)) {
    const expected = (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE version_id=?`).get(source.versionId) as { count: number }).count;
    if ((counts[name] ?? 0) !== expected || manifest.counts[name] !== expected) throw new Error(`Snapshot table count differs from the database: ${name}`);
  }
  const original = extractLegacyDb(await readFile(containedPath(root, source.path), 'utf8'));
  const indexed = (table: string) => new Map((records.get(table) ?? []).map(record => [Number(record.id), record]));
  const parts = indexed('parts');
  const names = indexed('partNames');
  const models = indexed('models');
  const relations = (table: string) => {
    const result = new Map<number, Array<Record<string, unknown>>>();
    for (const item of records.get(table) ?? []) {
      const key = Number(item.entryId);
      const list = result.get(key) ?? [];
      list.push(item);
      result.set(key, list);
    }
    for (const list of result.values()) list.sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
    return result;
  };
  const entryModels = relations('entryModels');
  const friendly = relations('friendlyLabels');
  const aliases = relations('aliases');
  const entries = (records.get('entries') ?? []).sort((a, b) => Number(a.sourceRowOrdinal) - Number(b.sourceRowOrdinal));
  if (entries.length !== original.rows.length || manifest.rowCount !== original.rows.length) throw new Error('Snapshot source row count mismatch');
  for (const [index, entry] of entries.entries()) {
    const part = parts.get(Number(entry.partId));
    const name = part ? names.get(Number(part.nameId)) : undefined;
    const price = Number(entry.basePrice);
    if (!part || !name || !Number.isSafeInteger(price) || String(price) !== entry.basePrice) throw new Error(`Snapshot source row cannot be reconstructed: ${index}`);
    const row: LegacyRow = {
      part: String(name.nameRaw), tech: String(part.techRaw), log: String(entry.logRaw), price, replacement: String(entry.replacementRaw),
      models: (entryModels.get(Number(entry.id)) ?? []).map(item => { const model = models.get(Number(item.modelId)); if (!model) throw new Error('Snapshot model reference is missing'); return String(model.nameRaw); }),
      friendly: (friendly.get(Number(entry.id)) ?? []).map(item => String(item.labelRaw)),
      aliases: (aliases.get(Number(entry.id)) ?? []).map(item => String(item.aliasRaw)),
    };
    if (!original.rows[index] || hashRow(row) !== hashRow(original.rows[index]!)) throw new Error(`Snapshot source roundtrip mismatch at row ${index}`);
  }
  return { chunks: seen.size, rows: entries.length };
}

export async function verifyRelease(options: { inputPath: string; expectedSha256?: string; reportPath?: string }): Promise<ReleaseVerification> {
  const input = resolve(options.inputPath);
  if (options.reportPath) await assertAbsent(resolve(options.reportPath));
  const temporary = await mkdtemp(join(tmpdir(), 'partavar-release-verification-'));
  try {
    let root = input;
    let archiveSha256: string | undefined;
    if ((await stat(input)).isFile()) {
      archiveSha256 = (await digestFile(input)).sha256;
      if (options.expectedSha256 && archiveSha256 !== options.expectedSha256.toLowerCase()) throw new Error('Release archive hash does not match the trusted expected hash');
      root = join(temporary, 'release');
      await archiveCommand('extract', input, root);
    } else if (options.expectedSha256) throw new Error('--sha256 requires a ZIP input; extracted trees use their file manifest');
    await assertRequiredFiles(root);
    const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8')) as ReleaseManifest;
    validateManifest(manifest);
    const files = await regularFiles(root, '', new Set(['node_modules']));
    const expectedPaths = new Set([...manifest.files.map(file => file.path), 'release-manifest.json']);
    if (files.length !== expectedPaths.size || files.some(path => !expectedPaths.has(path))) throw new Error('Release file inventory has unexpected or missing files');
    for (const file of manifest.files) {
      const actual = await digestFile(containedPath(root, file.path));
      if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw new Error(`Release file checksum or byte count mismatch: ${file.path}`);
    }
    const databasePaths = new Map<string, string>();
    for (const [index, path] of manifest.databases.entries()) {
      const copy = join(temporary, `database-${index}.db`);
      await copyFile(containedPath(root, path), copy);
      databasePaths.set(path, copy);
      const database = new Database(copy, { readonly: true, fileMustExist: true });
      try {
        if (database.pragma('integrity_check', { simple: true }) !== 'ok' || (database.pragma('foreign_key_check') as unknown[]).length) throw new Error(`Release database integrity or foreign key check failed: ${path}`);
      } finally { database.close(); }
    }
    const cataloguePath = databasePaths.get('private-data/sqlite/catalogue.db')!;
    const db = new Database(cataloguePath, { readonly: true, fileMustExist: true });
    let sourceRowsVerified = 0;
    let snapshotChunksVerified = 0;
    let snapshotRowsVerified = 0;
    let historicalSourcesVerified = 0;
    try {
      const active = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string }).active_version_id;
      if (active !== manifest.activeVersionId) throw new Error('Release active catalogue version differs from its manifest');
      const versions = db.prepare('SELECT id, archive_path, source_sha256, status FROM catalog_versions ORDER BY id').all() as Array<{ id: string; archive_path: string; source_sha256: string; status: string }>;
      if (versions.length !== manifest.sources.length) throw new Error('Release source version inventory differs from its database');
      for (const version of versions) {
        const source = manifest.sources.find(item => item.versionId === version.id);
        if (!source || source.originalPath !== version.archive_path || source.sha256 !== version.source_sha256 || source.status !== version.status ||
            !['validated', 'published'].includes(version.status) || (await digestFile(containedPath(root, source.path))).sha256 !== version.source_sha256) throw new Error(`Release source archive hash or mapping mismatch: ${version.id}`);
        const child = await run(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./verify-source.ts', import.meta.url)), '--root', root, '--db', cataloguePath, '--file', containedPath(root, source.path), '--version', version.id], { maxBuffer: 4 * 1024 * 1024 });
        const result = JSON.parse(child.stdout) as ReconciliationReport;
        sourceRowsVerified += result.counts.rows;
        const snapshot = await verifySnapshot(root, db, source);
        snapshotChunksVerified += snapshot.chunks;
        snapshotRowsVerified += snapshot.rows;
      }
      const activeSource = manifest.sources.find(source => source.versionId === active);
      if (!activeSource || activeSource.status !== 'published') throw new Error('Active catalogue must have a published immutable snapshot');
    } finally { db.close(); }
    const operationsPath = databasePaths.get('private-data/sqlite/operations.db');
    if (operationsPath) {
      const operations = new Database(operationsPath, { readonly: true, fileMustExist: true });
      try {
        if (operations.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ph_sources'").get()) {
          for (const source of operations.prepare('SELECT sha256, archive_name, byte_length FROM ph_sources').all() as Array<{ sha256: string; archive_name: string; byte_length: number }>) {
            const actual = await digestFile(containedPath(root, `private-data/sqlite/price-history-sources/${source.archive_name}`));
            if (actual.bytes !== source.byte_length || actual.sha256 !== source.sha256) throw new Error('Historical price source archive hash mismatch');
            historicalSourcesVerified++;
          }
        }
      } finally { operations.close(); }
    }
    const report: ReleaseVerification = {
      format: 'partavar-release-verification-v1', fileHashesVerified: true, fileCount: manifest.fileCount, totalFileBytes: manifest.totalFileBytes,
      databaseCount: manifest.databases.length, activeVersionId: manifest.activeVersionId, sourceVersionsVerified: manifest.sources.length,
      sourceRowsVerified, snapshotChunksVerified, snapshotRowsVerified, historicalSourcesVerified, integrityCheck: 'ok', foreignKeyViolations: 0,
      ...(archiveSha256 ? { archiveSha256 } : {}),
    };
    await writeReport(options.reportPath, report);
    return report;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(arg => arg !== '--'), options: { input: { type: 'string' }, sha256: { type: 'string' }, report: { type: 'string' } } });
  if (!values.input) throw new Error('Usage: pnpm release:verify --input ZIP_OR_DIRECTORY [--sha256 TRUSTED_SHA256] [--report NEW.json]');
  verifyRelease({ inputPath: values.input, ...(values.sha256 ? { expectedSha256: values.sha256 } : {}), ...(values.report ? { reportPath: values.report } : {}) })
    .then(report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}

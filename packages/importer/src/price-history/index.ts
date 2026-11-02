import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type ExcelJS from 'exceljs';
import type { PriceHistorySettings } from '../../../contracts/src/price-history.js';
import { calculateHistoryMetrics, classifyPriceHistory, DEFAULT_PRICE_HISTORY_SETTINGS, parseEffectiveDate, parseHistoricalPrice, percentileRanks, validateHistorySettings } from '../../../domain/src/price-history.js';
import { normalizeText } from '../../../domain/src/normalize.js';
import { historyArchiveRoot, openPriceHistoryDatabase } from './database.js';
import { explicitCellValue, readHistoryWorkbook } from './workbook.js';

export { openPriceHistoryDatabase } from './database.js';
export interface HistoryColumnMapping {
  sheet: string;
  headerRow: number;
  columns: { technicalCode?: string; logisticsCode?: string; partName?: string; price: string; effectiveDate?: string; currencyUnit?: string };
  effectiveDate?: string | null;
  currencyUnit: 'UNKNOWN' | 'IRR' | 'TOMAN';
}
type MatchStatus = 'matched_exact' | 'matched_unique_technical' | 'matched_reviewed_name' | 'ambiguous' | 'unmatched' | 'invalid_price' | 'invalid_date' | 'invalid_currency' | 'invalid_cell' | 'invalid_identifier' | 'duplicate';
export interface HistoryImportRow {
  observationId: string; sourceRow: number; sourceSheet: string; technicalCodeRaw: string; logisticsCodeRaw: string; partNameRaw: string;
  rawPrice: string; normalizedPrice: string | null; effectiveDate: string | null; currencyUnit: string; entryId: number | null;
  matchStatus: MatchStatus; reason: string | null; candidateEntryIds: number[]; raw: Record<string, string | number | null>;
}
export interface HistoryImportReport {
  batchId: string; sourceSha256: string; sourceFileName: string; catalogueVersion: string;
  status: string; sheets: string[]; rowCount: number; counts: Record<MatchStatus, number>; stagedAt: string; supersedesBatchId: string | null;
}
interface StageOptions { sourcePath: string; cataloguePath: string; operationsPath: string; catalogueVersion: string; mapping: HistoryColumnMapping; supersedesBatchId?: string }
interface AuditOptions { operationsPath: string; cataloguePath: string; batchId: string; actor: string; reason: string }
interface BatchRow { id: string; source_sha256: string; catalogue_version: string; report_json: string; supersedes_batch_id: string | null; status: string; superseded_by: string | null }
interface CatalogueIdentity { id: number; log_raw: string; tech_raw: string; name_raw: string }
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const matched = (status: string) => status.startsWith('matched_');

function ensureSeparate(cataloguePath: string, operationsPath: string): void {
  if (resolve(cataloguePath) === resolve(operationsPath)) throw new Error('Historical operations database must be separate from the catalogue database.');
  if (existsSync(cataloguePath) && existsSync(operationsPath)) {
    const catalogue = statSync(cataloguePath); const operations = statSync(operationsPath);
    if (catalogue.ino === operations.ino && catalogue.dev === operations.dev) throw new Error('Historical operations database aliases the catalogue database.');
  }
}
function openCatalogue(path: string, version: string): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!db.prepare("SELECT id FROM catalog_versions WHERE id=? AND status IN ('validated','published')").get(version)) throw new Error('Requested catalogue version is not available for history matching.');
    return db;
  } catch (error) { db.close(); throw error; }
}
function mappingValidated(value: HistoryColumnMapping): HistoryColumnMapping {
  if (!value || typeof value !== 'object' || typeof value.sheet !== 'string' || !value.sheet || !Number.isSafeInteger(value.headerRow) || value.headerRow < 1 || value.headerRow > 100000 || !value.columns || !value.columns.price || (!value.columns.logisticsCode && !value.columns.technicalCode) || !['UNKNOWN', 'IRR', 'TOMAN'].includes(value.currencyUnit)) throw new Error('Explicit sheet, header row, code/price columns and currency unit are required.');
  const allowed = new Set(['technicalCode', 'logisticsCode', 'partName', 'price', 'effectiveDate', 'currencyUnit']);
  const columns: HistoryColumnMapping['columns'] = { price: value.columns.price };
  for (const [key, column] of Object.entries(value.columns).sort(([a], [b]) => a.localeCompare(b))) {
    if (!allowed.has(key) || typeof column !== 'string' || !/^[A-Z]{1,2}$/.test(column) || columnNumber(column) > 256) throw new Error('Column mapping must use explicit Excel letters A through IV.');
    (columns as Record<string, string>)[key] = column;
  }
  if (new Set(Object.values(columns)).size !== Object.keys(columns).length) throw new Error('Each field must map to a distinct source column.');
  const effectiveDate = value.effectiveDate === null || value.effectiveDate === undefined ? null : parseEffectiveDate(value.effectiveDate);
  return { sheet: value.sheet, headerRow: value.headerRow, columns, effectiveDate, currencyUnit: value.currencyUnit };
}
function columnNumber(column: string): number { return [...column].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); }
function audit(db: Database.Database, batchId: string | null, action: string, actor: string, reason: string, details: unknown = {}): void {
  if (!actor.trim() || actor.length > 200 || !reason.trim() || reason.length > 2000) throw new Error('An actor and a concrete reason are required for history audit operations.');
  db.prepare('INSERT INTO ph_events(batch_id,action,actor,reason,created_at,details_json) VALUES(?,?,?,?,?,?)').run(batchId, action, actor.trim(), reason.trim(), new Date().toISOString(), JSON.stringify(details));
}
function batch(db: Database.Database, id: string): BatchRow {
  const row = db.prepare('SELECT b.*,s.status,s.superseded_by FROM ph_batches b JOIN ph_batch_state s ON s.batch_id=b.id WHERE b.id=?').get(id) as BatchRow | undefined;
  if (!row) throw new Error('Historical import batch was not found.');
  return row;
}
function settingsOf(db: Database.Database): PriceHistorySettings {
  const row = db.prepare('SELECT settings_json FROM ph_meta WHERE singleton=1').get() as { settings_json: string | null };
  return row.settings_json ? JSON.parse(row.settings_json) as PriceHistorySettings : { ...DEFAULT_PRICE_HISTORY_SETTINGS };
}

function parseRows(sheet: ExcelJS.Worksheet, mapping: HistoryColumnMapping, identities: CatalogueIdentity[], batchId: string): HistoryImportRow[] {
  const byLog = new Map(identities.map(entry => [entry.log_raw, entry]));
  const byTech = new Map<string, CatalogueIdentity[]>();
  for (const identity of identities) byTech.set(identity.tech_raw, [...byTech.get(identity.tech_raw) ?? [], identity]);
  const rows: HistoryImportRow[] = [];
  const seen = new Set<string>();
  for (let index = mapping.headerRow + 1; index <= sheet.rowCount; index++) {
    const source = sheet.getRow(index);
    if (!source.hasValues) continue;
    const row: HistoryImportRow = { observationId: `${batchId}:${index}`, sourceRow: index, sourceSheet: sheet.name, technicalCodeRaw: '', logisticsCodeRaw: '', partNameRaw: '', rawPrice: '', normalizedPrice: null, effectiveDate: null, currencyUnit: mapping.currencyUnit, entryId: null, matchStatus: 'unmatched', reason: null, candidateEntryIds: [], raw: {} };
    const values: Record<string, string | number | Date | null> = {};
    try {
      for (const [field, column] of Object.entries(mapping.columns)) {
        const cell = source.getCell(columnNumber(column));
        // Preserve even unsupported raw cell objects in the source archive and row audit JSON.
        row.raw[field] = typeof cell.value === 'object' && !(cell.value instanceof Date) && cell.value !== null ? JSON.stringify(cell.value) : cell.value instanceof Date ? cell.value.toISOString() : typeof cell.value === 'boolean' ? String(cell.value) : cell.value ?? null;
        values[field] = explicitCellValue(cell);
      }
    } catch (error) { row.matchStatus = 'invalid_cell'; row.reason = error instanceof Error ? error.message : 'Unsupported cell'; rows.push(row); continue; }
    row.rawPrice = String(values.price ?? '');
    try { row.normalizedPrice = parseHistoricalPrice(values.price); } catch { row.matchStatus = 'invalid_price'; row.reason = 'Missing, negative, fractional or unsafe integer price'; }
    for (const [field, key] of [['technicalCode', 'technicalCodeRaw'], ['logisticsCode', 'logisticsCodeRaw'], ['partName', 'partNameRaw']] as const) {
      const value = values[field];
      if (value !== undefined && value !== null && typeof value !== 'string') { row.matchStatus = 'invalid_identifier'; row.reason = 'Codes and names must be stored as text, preserving source leading zeroes'; }
      row[key] = String(value ?? '');
    }
    try {
      const date = values.effectiveDate;
      row.effectiveDate = date === undefined || date === null || date === '' ? mapping.effectiveDate ?? null : parseEffectiveDate(date instanceof Date ? date.toISOString().slice(0, 10) : date);
    } catch { row.matchStatus = 'invalid_date'; row.reason = 'Effective date must be an explicit valid ISO Gregorian date'; }
    if (mapping.columns.currencyUnit) {
      const currency = values.currencyUnit;
      if (typeof currency !== 'string' || !['UNKNOWN', 'IRR', 'TOMAN'].includes(currency)) { row.matchStatus = 'invalid_currency'; row.reason = 'Currency column must explicitly contain UNKNOWN, IRR or TOMAN'; }
      else row.currencyUnit = currency;
    }
    if (row.matchStatus.startsWith('invalid_')) { rows.push(row); continue; }
    let candidates: CatalogueIdentity[] = [];
    if (row.logisticsCodeRaw) {
      const identity = byLog.get(row.logisticsCodeRaw);
      if (identity && (!row.technicalCodeRaw || identity.tech_raw === row.technicalCodeRaw)) { row.entryId = identity.id; row.matchStatus = 'matched_exact'; }
      else row.reason = identity ? 'Logistics code exists but explicit technical code conflicts' : 'Exact logistics code not present in the selected catalogue';
    } else if (row.technicalCodeRaw) {
      candidates = byTech.get(row.technicalCodeRaw) ?? [];
      const originalCount = candidates.length;
      if (candidates.length > 1 && row.partNameRaw) candidates = candidates.filter(candidate => normalizeText(candidate.name_raw) === normalizeText(row.partNameRaw));
      if (candidates.length === 1) { row.entryId = candidates[0]!.id; row.matchStatus = originalCount > 1 ? 'matched_reviewed_name' : 'matched_unique_technical'; }
      else if (candidates.length > 1) { row.matchStatus = 'ambiguous'; row.reason = 'Technical code identifies multiple logistics entries; no observation was copied to siblings'; row.candidateEntryIds = candidates.map(candidate => candidate.id); }
      else row.reason = 'Technical code/name has no unambiguous catalogue entry';
    } else row.reason = 'No source identifier';
    const evidenceKey = JSON.stringify([row.technicalCodeRaw, row.logisticsCodeRaw, row.partNameRaw, row.normalizedPrice, row.effectiveDate, row.currencyUnit]);
    if (seen.has(evidenceKey)) { row.matchStatus = 'duplicate'; row.reason = 'Exact repeated source evidence within this worksheet'; row.entryId = null; row.candidateEntryIds = []; }
    seen.add(evidenceKey);
    rows.push(row);
  }
  return rows;
}

export async function stagePriceHistory(options: StageOptions): Promise<HistoryImportReport> {
  ensureSeparate(options.cataloguePath, options.operationsPath);
  const mapping = mappingValidated(options.mapping);
  const loaded = await readHistoryWorkbook(options.sourcePath);
  const sourceSha256 = sha(loaded.bytes);
  const sheet = loaded.workbook.getWorksheet(mapping.sheet);
  if (!sheet) throw new Error('Mapped worksheet was not found; inspect available sheet names before staging.');
  const catalogue = openCatalogue(options.cataloguePath, options.catalogueVersion);
  const db = openPriceHistoryDatabase(options.operationsPath);
  try {
    const mappingJson = JSON.stringify(mapping);
    const mappingHash = sha(mappingJson);
    const duplicate = db.prepare('SELECT id FROM ph_batches WHERE source_sha256=? AND catalogue_version=? AND mapping_hash=?').get(sourceSha256, options.catalogueVersion, mappingHash) as { id: string } | undefined;
    if (duplicate) { const previous = batch(db, duplicate.id); return { ...JSON.parse(previous.report_json) as HistoryImportReport, status: previous.status }; }
    const previousMapping = db.prepare('SELECT id FROM ph_batches WHERE source_sha256=? AND catalogue_version=?').get(sourceSha256, options.catalogueVersion) as { id: string } | undefined;
    if (previousMapping && options.supersedesBatchId !== previousMapping.id) throw new Error('This source was already staged with different mapping; explicit supersede is required.');
    if (options.supersedesBatchId) {
      const prior = batch(db, options.supersedesBatchId);
      if (prior.catalogue_version !== options.catalogueVersion || prior.status !== 'active') throw new Error('Supersede must identify an active batch for the same catalogue version.');
    }
    const identities = catalogue.prepare('SELECT e.id,e.log_raw,p.tech_raw,n.name_raw FROM catalog_entries e JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id JOIN part_names n ON n.version_id=p.version_id AND n.id=p.name_id WHERE e.version_id=?').all(options.catalogueVersion) as CatalogueIdentity[];
    const batchId = randomUUID();
    const rows = parseRows(sheet, mapping, identities, batchId);
    const counts = Object.fromEntries(['matched_exact', 'matched_unique_technical', 'matched_reviewed_name', 'ambiguous', 'unmatched', 'invalid_price', 'invalid_date', 'invalid_currency', 'invalid_cell', 'invalid_identifier', 'duplicate'].map(key => [key, 0])) as Record<MatchStatus, number>;
    for (const row of rows) counts[row.matchStatus]++;
    const report: HistoryImportReport = { batchId, sourceSha256, sourceFileName: basename(options.sourcePath), catalogueVersion: options.catalogueVersion, status: 'staged', sheets: loaded.sheets, rowCount: rows.length, counts, stagedAt: new Date().toISOString(), supersedesBatchId: options.supersedesBatchId ?? null };
    const archiveRoot = historyArchiveRoot(options.operationsPath);
    await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
    const archiveName = `${sourceSha256}.xlsx`;
    const archivePath = join(archiveRoot, archiveName);
    if (existsSync(archivePath)) { if (sha(await readFile(archivePath)) !== sourceSha256) throw new Error('Existing source archive failed its checksum.'); }
    else await writeFile(archivePath, loaded.bytes, { flag: 'wx', mode: 0o600 });
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO ph_sources VALUES(?,?,?,?,?,?)').run(sourceSha256, report.sourceFileName, archiveName, loaded.bytes.length, JSON.stringify(loaded.sheets), report.stagedAt);
      db.prepare('INSERT INTO ph_batches VALUES(?,?,?,?,?,?,?,?)').run(batchId, sourceSha256, options.catalogueVersion, mappingJson, mappingHash, report.stagedAt, JSON.stringify(report), report.supersedesBatchId);
      db.prepare("INSERT INTO ph_batch_state VALUES(?,'staged',NULL)").run(batchId);
      const insert = db.prepare('INSERT INTO ph_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const row of rows) insert.run(row.observationId, batchId, row.sourceSheet, row.sourceRow, row.effectiveDate, row.technicalCodeRaw, row.logisticsCodeRaw, row.partNameRaw, row.rawPrice, row.normalizedPrice, row.currencyUnit, row.entryId, row.matchStatus, row.reason, JSON.stringify(row.candidateEntryIds), JSON.stringify(row.raw));
      audit(db, batchId, 'STAGE', 'local-operator', 'Source parsed and archived for explicit review', { counts });
    }).immediate();
    return report;
  } finally { catalogue.close(); db.close(); }
}

export function previewPriceHistory(operationsPath: string, batchId: string, limit = 100, offset = 0): HistoryImportReport & { rows: HistoryImportRow[]; nextOffset: number | null } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Preview must be bounded to 1..1000 rows and a non-negative offset.');
  const db = new Database(operationsPath, { readonly: true, fileMustExist: true });
  try {
    const selected = batch(db, batchId);
    const report = JSON.parse(selected.report_json) as HistoryImportReport;
    const records = db.prepare('SELECT * FROM ph_observations WHERE batch_id=? ORDER BY source_row LIMIT ? OFFSET ?').all(batchId, limit, offset) as Array<Record<string, unknown>>;
    const rows = records.map(row => ({ observationId: row.id as string, sourceRow: row.source_row as number, sourceSheet: row.source_sheet as string, technicalCodeRaw: row.technical_raw as string, logisticsCodeRaw: row.logistics_raw as string, partNameRaw: row.part_name_raw as string, rawPrice: row.raw_price as string, normalizedPrice: row.normalized_price as string | null, effectiveDate: row.effective_date as string | null, currencyUnit: row.currency_unit as string, entryId: row.entry_id as number | null, matchStatus: row.match_status as MatchStatus, reason: row.reason as string | null, candidateEntryIds: JSON.parse(row.candidates_json as string) as number[], raw: JSON.parse(row.raw_json as string) as HistoryImportRow['raw'] }));
    return { ...report, status: selected.status, rows, nextOffset: offset + rows.length < report.rowCount ? offset + rows.length : null };
  } finally { db.close(); }
}

/** Call inside the same write transaction as the state/audit transition. */
function recompute(db: Database.Database, catalogue: Database.Database, version: string): void {
  const settings = settingsOf(db);
  const validIds = new Set((catalogue.prepare('SELECT id FROM catalog_entries WHERE version_id=?').all(version) as Array<{ id: number }>).map(row => row.id));
  const observations = db.prepare("SELECT o.* FROM ph_observations o JOIN ph_batches b ON b.id=o.batch_id JOIN ph_batch_state s ON s.batch_id=b.id WHERE b.catalogue_version=? AND s.status='active'").all(version) as Array<{ entry_id: number | null; match_status: string; normalized_price: string | null; effective_date: string | null; currency_unit: string; candidates_json: string }>;
  const perEntry = new Map<number, { points: Array<{ price: string; effectiveDate: string | null; currencyUnit: string }>; ambiguous: number }>();
  const ensure = (id: number) => { if (!perEntry.has(id)) perEntry.set(id, { points: [], ambiguous: 0 }); return perEntry.get(id)!; };
  for (const row of observations) {
    if (row.entry_id !== null && validIds.has(row.entry_id) && matched(row.match_status) && row.normalized_price !== null) ensure(row.entry_id).points.push({ price: row.normalized_price, effectiveDate: row.effective_date, currencyUnit: row.currency_unit });
    if (row.match_status === 'ambiguous') for (const id of JSON.parse(row.candidates_json) as number[]) if (validIds.has(id)) ensure(id).ambiguous++;
  }
  const metrics = [...perEntry].map(([entryId, data]) => ({ entryId, metrics: calculateHistoryMetrics(data.points, data.ambiguous) }));
  const eligible = metrics.filter(row => row.metrics.neutralReason === null && row.metrics.observationCount >= settings.minimumObservations && row.metrics.cumulativeChangeBps !== null);
  const ranks = percentileRanks(eligible.map(row => row.metrics.cumulativeChangeBps!));
  eligible.forEach((row, i) => { row.metrics.percentileBps = ranks[i] ?? null; });
  metrics.sort((a, b) => {
    const av = a.metrics.cumulativeChangeBps; const bv = b.metrics.cumulativeChangeBps;
    if (av === null || bv === null) return av === bv ? a.entryId - b.entryId : av === null ? 1 : -1;
    return BigInt(av) > BigInt(bv) ? -1 : BigInt(av) < BigInt(bv) ? 1 : a.entryId - b.entryId;
  });
  db.prepare('DELETE FROM ph_metrics WHERE catalogue_version=?').run(version);
  const insert = db.prepare('INSERT INTO ph_metrics VALUES(?,?,?,?,?,?,?,?,?)');
  metrics.forEach(({ entryId, metrics: metric }, index) => insert.run(version, entryId, JSON.stringify(metric), classifyPriceHistory(metric, settings), metric.observationCount, metric.firstDate, metric.lastDate, metric.cumulativeChangeBps, index));
}

export async function commitPriceHistory(options: AuditOptions): Promise<{ batchId: string; status: string; revision: number }> {
  ensureSeparate(options.cataloguePath, options.operationsPath);
  const db = openPriceHistoryDatabase(options.operationsPath);
  let catalogue: Database.Database | undefined;
  try {
    const selected = batch(db, options.batchId);
    catalogue = openCatalogue(options.cataloguePath, selected.catalogue_version);
    if (sha(await readFile(join(historyArchiveRoot(options.operationsPath), `${selected.source_sha256}.xlsx`))) !== selected.source_sha256) throw new Error('Source archive checksum differs from the immutable staged batch.');
    db.transaction(() => {
      const current = batch(db, selected.id);
      if (current.status === 'active') return;
      if (current.status !== 'staged') throw new Error('Only a staged batch can be committed.');
      if (current.supersedes_batch_id) {
        const prior = batch(db, current.supersedes_batch_id);
        if (prior.status !== 'active' || prior.catalogue_version !== current.catalogue_version) throw new Error('Superseded batch is no longer active for this catalogue version.');
        db.prepare("UPDATE ph_batch_state SET status='superseded',superseded_by=? WHERE batch_id=?").run(current.id, prior.id);
        audit(db, prior.id, 'SUPERSEDE', options.actor, options.reason, { successor: current.id });
      }
      db.prepare("UPDATE ph_batch_state SET status='active' WHERE batch_id=?").run(current.id);
      audit(db, current.id, 'COMMIT', options.actor, options.reason);
      recompute(db, catalogue!, current.catalogue_version);
      db.prepare('UPDATE ph_meta SET revision=revision+1 WHERE singleton=1').run();
    }).immediate();
    return { batchId: selected.id, status: 'active', revision: (db.prepare('SELECT revision FROM ph_meta WHERE singleton=1').get() as { revision: number }).revision };
  } finally { catalogue?.close(); db.close(); }
}

export async function rollbackPriceHistory(options: AuditOptions): Promise<{ batchId: string; status: string }> {
  ensureSeparate(options.cataloguePath, options.operationsPath);
  const db = openPriceHistoryDatabase(options.operationsPath);
  let catalogue: Database.Database | undefined;
  try {
    const selected = batch(db, options.batchId);
    catalogue = openCatalogue(options.cataloguePath, selected.catalogue_version);
    if (selected.status === 'active' && selected.supersedes_batch_id) {
      const predecessor = batch(db, selected.supersedes_batch_id);
      if (sha(await readFile(join(historyArchiveRoot(options.operationsPath), `${predecessor.source_sha256}.xlsx`))) !== predecessor.source_sha256) throw new Error('Predecessor source archive checksum differs from its immutable batch.');
    }
    db.transaction(() => {
      const current = batch(db, selected.id);
      if (current.status === 'rolled_back') return;
      if (current.status !== 'active') throw new Error('Only an active batch can be rolled back.');
      db.prepare("UPDATE ph_batch_state SET status='rolled_back' WHERE batch_id=?").run(current.id);
      audit(db, current.id, 'ROLLBACK', options.actor, options.reason);
      if (current.supersedes_batch_id) {
        const prior = batch(db, current.supersedes_batch_id);
        if (prior.status !== 'superseded' || prior.superseded_by !== current.id) throw new Error('Previous batch has changed and cannot be automatically reinstated.');
        db.prepare("UPDATE ph_batch_state SET status='active',superseded_by=NULL WHERE batch_id=?").run(prior.id);
        audit(db, prior.id, 'REINSTATE', options.actor, options.reason, { rolledBack: current.id });
      }
      recompute(db, catalogue!, current.catalogue_version);
      db.prepare('UPDATE ph_meta SET revision=revision+1 WHERE singleton=1').run();
    }).immediate();
    return { batchId: selected.id, status: 'rolled_back' };
  } finally { catalogue?.close(); db.close(); }
}

export async function setPriceHistorySettings(options: { operationsPath: string; cataloguePath: string; actor: string; reason: string; settings: PriceHistorySettings }): Promise<PriceHistorySettings> {
  ensureSeparate(options.cataloguePath, options.operationsPath);
  validateHistorySettings(options.settings);
  const db = openPriceHistoryDatabase(options.operationsPath);
  const catalogue = new Database(options.cataloguePath, { readonly: true, fileMustExist: true });
  try {
    db.transaction(() => {
      const previous = settingsOf(db);
      db.prepare('UPDATE ph_meta SET settings_json=?,revision=revision+1 WHERE singleton=1').run(JSON.stringify(options.settings));
      const versions = db.prepare('SELECT DISTINCT catalogue_version FROM ph_batches').all() as Array<{ catalogue_version: string }>;
      for (const version of versions) recompute(db, catalogue, version.catalogue_version);
      audit(db, null, 'SETTINGS', options.actor, options.reason, { previous, next: options.settings });
    }).immediate();
    return options.settings;
  } finally { catalogue.close(); db.close(); }
}

interface BackupManifest { format: 'partavar-price-history-backup-v1'; createdAt: string; databaseSha256: string; sources: Array<{ sha256: string; archiveName: string }>; batchCount: number; observationCount: number }
export async function backupPriceHistory(options: { operationsPath: string; outputPath: string }): Promise<BackupManifest> {
  if (existsSync(options.outputPath)) throw new Error('Backup output already exists; choose a new directory.');
  const sourceDb = new Database(options.operationsPath, { readonly: true, fileMustExist: true });
  await mkdir(options.outputPath, { recursive: false, mode: 0o700 });
  const target = join(options.outputPath, 'operations.db');
  try {
    await sourceDb.backup(target);
    // Read evidence metadata from the completed SQLite online backup, not the live writer.
    const snapshot = new Database(target, { readonly: true, fileMustExist: true });
    try {
      if (snapshot.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity verification failed.');
      const sources = snapshot.prepare('SELECT sha256,archive_name FROM ph_sources ORDER BY sha256').all() as Array<{ sha256: string; archive_name: string }>;
      await mkdir(join(options.outputPath, 'sources'), { mode: 0o700 });
      for (const source of sources) {
        const bytes = await readFile(join(historyArchiveRoot(options.operationsPath), source.archive_name));
        if (sha(bytes) !== source.sha256) throw new Error('A source archive failed checksum validation during backup.');
        await writeFile(join(options.outputPath, 'sources', source.archive_name), bytes, { flag: 'wx', mode: 0o600 });
      }
      const manifest: BackupManifest = { format: 'partavar-price-history-backup-v1', createdAt: new Date().toISOString(), databaseSha256: sha(await readFile(target)), sources: sources.map(source => ({ sha256: source.sha256, archiveName: source.archive_name })), batchCount: (snapshot.prepare('SELECT count(*) AS n FROM ph_batches').get() as { n: number }).n, observationCount: (snapshot.prepare('SELECT count(*) AS n FROM ph_observations').get() as { n: number }).n };
      await writeFile(join(options.outputPath, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
      return manifest;
    } finally { snapshot.close(); }
  } finally { sourceDb.close(); }
}

export async function restorePriceHistory(options: { backupPath: string; operationsPath: string }): Promise<{ restored: true; batchCount: number; observationCount: number }> {
  if (existsSync(options.operationsPath) || existsSync(historyArchiveRoot(options.operationsPath))) throw new Error('Restore destination already exists; restore to a fresh private directory.');
  const manifest = JSON.parse(await readFile(join(options.backupPath, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.format !== 'partavar-price-history-backup-v1' || !Array.isArray(manifest.sources) || manifest.sources.length > 100000 || sha(await readFile(join(options.backupPath, 'operations.db'))) !== manifest.databaseSha256) throw new Error('Backup manifest/database checksum is invalid.');
  const snapshot = new Database(join(options.backupPath, 'operations.db'), { readonly: true, fileMustExist: true });
  try {
    if (snapshot.pragma('integrity_check', { simple: true }) !== 'ok' || (snapshot.pragma('foreign_key_check') as unknown[]).length > 0 || (snapshot.prepare('SELECT schema_version FROM ph_meta').get() as { schema_version: number }).schema_version !== 1) throw new Error('Backup SQLite verification failed.');
    const sources = snapshot.prepare('SELECT sha256,archive_name FROM ph_sources ORDER BY sha256').all() as Array<{ sha256: string; archive_name: string }>;
    if (JSON.stringify(sources.map(source => ({ sha256: source.sha256, archiveName: source.archive_name }))) !== JSON.stringify(manifest.sources) || (snapshot.prepare('SELECT count(*) AS n FROM ph_batches').get() as { n: number }).n !== manifest.batchCount || (snapshot.prepare('SELECT count(*) AS n FROM ph_observations').get() as { n: number }).n !== manifest.observationCount) throw new Error('Backup reconciliation failed.');
    for (const source of manifest.sources) {
      if (!/^[a-f0-9]{64}$/.test(source.sha256) || source.archiveName !== `${source.sha256}.xlsx` || sha(await readFile(join(options.backupPath, 'sources', source.archiveName))) !== source.sha256) throw new Error('Backup source archive checksum is invalid.');
    }
    await mkdir(dirname(resolve(options.operationsPath)), { recursive: true, mode: 0o700 });
    await mkdir(historyArchiveRoot(options.operationsPath), { recursive: false, mode: 0o700 });
    for (const source of manifest.sources) await copyFile(join(options.backupPath, 'sources', source.archiveName), join(historyArchiveRoot(options.operationsPath), source.archiveName), 1);
    await copyFile(join(options.backupPath, 'operations.db'), options.operationsPath, 1);
    return { restored: true, batchCount: manifest.batchCount, observationCount: manifest.observationCount };
  } finally { snapshot.close(); }
}

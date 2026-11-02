import { readFile } from 'node:fs/promises';
import type { LegacyDb, LegacyRow } from '@partsfinder/domain';
import { calculatePrices } from '@partsfinder/domain';
import { openCatalogueDatabase, defaultDatabasePath } from './database.js';
import { extractLegacyDb } from './extract-literal.js';
import { canonicalJson, hashDatabaseRows, hashFields, hashFullDatabase, hashRow, sha256, ROW_FIELDS, type RowField } from './hash.js';
import type { CatalogueCounts } from './transform.js';

export interface VerifyOptions {
  dbPath?: string;
  sourcePath?: string;
  allowStaging?: boolean;
}

export interface ReconciliationReport {
  versionId: string;
  sourceSha256: string;
  databaseSourceSha256: string;
  sourceShaMatches: boolean;
  rowHashMismatches: number;
  fullRowsHashMatch: boolean;
  metadataHashMatch: boolean;
  fullDatabaseHashMatch: boolean;
  fieldHashMatches: Record<RowField, boolean>;
  storedRowHashMismatches: number;
  integrityCheck: string;
  foreignKeyViolations: number;
  normalizedTechCollisionGroups: number;
  normalizedLogCollisionGroups: number;
  priceRoundingDifferences: number;
  counts: CatalogueCounts;
}

interface StoredEntry {
  id: number;
  log_raw: string;
  base_price: string;
  replacement_raw: string;
  source_row_ordinal: number;
  source_row_sha256: string;
  tech_raw: string;
  name_raw: string;
}

interface OrderedValue {
  entry_id: number;
  value: string;
}

function orderedValues(db: ReturnType<typeof openCatalogueDatabase>, sql: string, versionId: string): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const rows = db.prepare(sql).all(versionId) as OrderedValue[];
  for (const row of rows) {
    const values = result.get(row.entry_id) ?? [];
    values.push(row.value);
    result.set(row.entry_id, values);
  }
  return result;
}

function count(db: ReturnType<typeof openCatalogueDatabase>, sql: string, versionId: string): number {
  const row = db.prepare(sql).get(versionId) as { count: number };
  return Number(row.count);
}

export async function verifyCatalogue(versionId: string, options: VerifyOptions = {}): Promise<ReconciliationReport> {
  const db = openCatalogueDatabase(options.dbPath ?? defaultDatabasePath());
  try {
    const version = db.prepare(`
      SELECT id, source_sha256, archive_path, payload_hash, status
      FROM catalog_versions WHERE id=?
    `).get(versionId) as { id: string; source_sha256: string; archive_path: string; payload_hash: string; status: string } | undefined;
    if (!version) throw new Error(`Catalogue version is unavailable: ${versionId}`);
    if (!['validated', 'published'].includes(version.status) && !(options.allowStaging && version.status === 'staging')) {
      throw new Error(`Catalogue version ${versionId} is not verifiable in status ${version.status}`);
    }

    const sourcePath = options.sourcePath ?? version.archive_path;
    const sourceBytes = await readFile(sourcePath);
    const sourceSha256 = sha256(sourceBytes);
    const sourceDb = extractLegacyDb(sourceBytes.toString('utf8'));

    const entries = db.prepare(`
      SELECT e.id, e.log_raw, CAST(e.base_price AS TEXT) AS base_price,
        e.replacement_raw, e.source_row_ordinal, e.source_row_sha256,
        p.tech_raw, n.name_raw
      FROM catalog_entries e
      JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
      JOIN part_names n ON n.version_id=p.version_id AND n.id=p.name_id
      WHERE e.version_id=? ORDER BY e.source_row_ordinal
    `).all(versionId) as StoredEntry[];
    const models = orderedValues(db, `
      SELECT rel.entry_id, model.name_raw AS value
      FROM entry_vehicle_models rel
      JOIN vehicle_models model ON model.version_id=rel.version_id AND model.id=rel.model_id
      WHERE rel.version_id=? ORDER BY rel.entry_id, rel.ordinal
    `, versionId);
    const friendly = orderedValues(db, `
      SELECT entry_id, label_raw AS value FROM entry_friendly_labels
      WHERE version_id=? ORDER BY entry_id, ordinal
    `, versionId);
    const aliases = orderedValues(db, `
      SELECT entry_id, alias_raw AS value FROM entry_aliases
      WHERE version_id=? ORDER BY entry_id, ordinal
    `, versionId);

    const reconstructedRows: LegacyRow[] = entries.map((entry) => {
      const priceInteger = BigInt(entry.base_price);
      const price = Number(priceInteger);
      if (!Number.isSafeInteger(price)) throw new Error(`SQLite price exceeds JavaScript safe integer at source row ${entry.source_row_ordinal}`);
      return {
        part: entry.name_raw,
        models: models.get(entry.id) ?? [],
        tech: entry.tech_raw,
        log: entry.log_raw,
        price,
        replacement: entry.replacement_raw,
        friendly: friendly.get(entry.id) ?? [],
        aliases: aliases.get(entry.id) ?? [],
      };
    });

    let rowHashMismatches = Math.abs(sourceDb.rows.length - reconstructedRows.length);
    let storedRowHashMismatches = 0;
    let priceRoundingDifferences = 0;
    const commonRows = Math.min(sourceDb.rows.length, reconstructedRows.length);
    for (let index = 0; index < commonRows; index++) {
      const sourceRow = sourceDb.rows[index];
      const reconstructed = reconstructedRows[index];
      const stored = entries[index];
      if (!sourceRow || !reconstructed || !stored) {
        rowHashMismatches++;
        continue;
      }
      if (hashRow(sourceRow) !== hashRow(reconstructed)) rowHashMismatches++;
      if (stored.source_row_sha256 !== hashRow(reconstructed)) storedRowHashMismatches++;
      const expectedPrices = calculatePrices(String(sourceRow.price));
      if (expectedPrices.middle !== String(Math.round(sourceRow.price * 1.1)) || expectedPrices.final !== String(Math.round(sourceRow.price * 1.2))) {
        priceRoundingDifferences++;
      }
    }

    const metadataRows = db.prepare('SELECT metadata_key, value_json FROM catalog_metadata WHERE version_id=? ORDER BY metadata_key').all(versionId) as Array<{ metadata_key: string; value_json: string }>;
    const reconstructedMetadata = Object.fromEntries(metadataRows.map(({ metadata_key, value_json }) => [metadata_key, JSON.parse(value_json) as unknown]));
    const sourceMetadata = Object.fromEntries(Object.entries(sourceDb).filter(([key]) => key !== 'rows'));
    const reconstructedDb = { ...reconstructedMetadata, rows: reconstructedRows } as LegacyDb;
    const metadataHashMatch = canonicalJson(sourceMetadata) === canonicalJson(reconstructedMetadata);
    const fullRowsHashMatch = sourceDb.rows.length === reconstructedRows.length && hashDatabaseRows(sourceDb.rows) === hashDatabaseRows(reconstructedRows);
    const fullDatabaseHashMatch = metadataHashMatch && fullRowsHashMatch && hashFullDatabase(reconstructedDb) === version.payload_hash;
    const expectedFieldHashes = hashFields(sourceDb.rows);
    const actualFieldHashes = hashFields(reconstructedRows);
    const fieldHashMatches = Object.fromEntries(ROW_FIELDS.map((field) => [field, expectedFieldHashes[field] === actualFieldHashes[field]])) as Record<RowField, boolean>;

    const primaryMetadata = reconstructedMetadata.primaryOptions;
    const rawPrimaryOptions = Array.isArray(primaryMetadata) ? primaryMetadata.length : 0;
    const priceSum = db.prepare('SELECT CAST(SUM(base_price) AS TEXT) AS total FROM catalog_entries WHERE version_id=?').get(versionId) as { total: string | null } | undefined;
    const counts: CatalogueCounts = {
      rows: count(db, 'SELECT COUNT(*) AS count FROM catalog_entries WHERE version_id=?', versionId),
      technicalCodes: count(db, 'SELECT COUNT(*) AS count FROM parts WHERE version_id=?', versionId),
      logisticsCodes: count(db, 'SELECT COUNT(*) AS count FROM catalog_entries WHERE version_id=?', versionId),
      names: count(db, 'SELECT COUNT(*) AS count FROM part_names WHERE version_id=?', versionId),
      rawModels: count(db, 'SELECT COUNT(DISTINCT model_id) AS count FROM entry_vehicle_models WHERE version_id=?', versionId),
      entryModelLinks: count(db, 'SELECT COUNT(*) AS count FROM entry_vehicle_models WHERE version_id=?', versionId),
      friendlyLinks: count(db, 'SELECT COUNT(*) AS count FROM entry_friendly_labels WHERE version_id=?', versionId),
      aliasLinks: count(db, 'SELECT COUNT(*) AS count FROM entry_aliases WHERE version_id=?', versionId),
      entriesWithoutModels: count(db, 'SELECT COUNT(*) AS count FROM catalog_entries e WHERE e.version_id=? AND NOT EXISTS (SELECT 1 FROM entry_vehicle_models m WHERE m.version_id=e.version_id AND m.entry_id=e.id)', versionId),
      entriesWithReplacement: count(db, "SELECT COUNT(*) AS count FROM catalog_entries WHERE version_id=? AND replacement_raw<>''", versionId),
      technicalCodesWithMultiplePrices: count(db, 'SELECT COUNT(*) AS count FROM (SELECT part_id FROM catalog_entries WHERE version_id=? GROUP BY part_id HAVING COUNT(DISTINCT base_price)>1)', versionId),
      sourcePriceSum: priceSum?.total ?? '0',
      rawPrimaryOptions,
      effectivePrimaryOptions: count(db, "SELECT COUNT(*) AS count FROM vehicle_options WHERE version_id=? AND option_kind='main'", versionId),
      otherOptions: count(db, "SELECT COUNT(*) AS count FROM vehicle_options WHERE version_id=? AND option_kind='other'", versionId),
      presetFamilies: count(db, 'SELECT COUNT(*) AS count FROM preset_families WHERE version_id=?', versionId),
    };

    const integrityResult = db.prepare('PRAGMA integrity_check').get() as Record<string, string>;
    const integrityCheck = Object.values(integrityResult)[0] ?? 'unknown';
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    const normalizedTechCollisionGroups = count(db, `
      SELECT COUNT(*) AS count FROM (
        SELECT tech_norm FROM parts WHERE version_id=? GROUP BY tech_norm HAVING COUNT(DISTINCT tech_raw)>1
      )
    `, versionId);
    const normalizedLogCollisionGroups = count(db, `
      SELECT COUNT(*) AS count FROM (
        SELECT log_norm FROM catalog_entries WHERE version_id=? GROUP BY log_norm HAVING COUNT(DISTINCT log_raw)>1
      )
    `, versionId);

    return {
      versionId,
      sourceSha256,
      databaseSourceSha256: version.source_sha256,
      sourceShaMatches: sourceSha256 === version.source_sha256,
      rowHashMismatches,
      fullRowsHashMatch,
      metadataHashMatch,
      fullDatabaseHashMatch,
      fieldHashMatches,
      storedRowHashMismatches,
      integrityCheck,
      foreignKeyViolations,
      normalizedTechCollisionGroups,
      normalizedLogCollisionGroups,
      priceRoundingDifferences,
      counts,
    };
  } finally {
    db.close();
  }
}

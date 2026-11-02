import type Database from 'better-sqlite3';
import type { CatalogueManifest, EntryDetail, EntryListing, EntryListingPage, EntrySummary, VehicleOption } from '@partsfinder/contracts';
import { calculatePrices, normalizeText } from '@partsfinder/domain';

export class ApiRepositoryError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ApiRepositoryError';
  }
}

interface VersionRow {
  id: string;
  source_sha256: string;
  schema_version: number;
  normalization_version: number;
  rules_version: number;
  created_at: string;
  published_at: string | null;
  price_effective_at: string | null;
  currency_unit: 'UNKNOWN' | 'IRR' | 'TOMAN';
  counts_json: string;
  status: string;
}

interface EntryRow {
  entry_id: number;
  part_id: number;
  part_name_raw: string;
  tech_raw: string;
  log_raw: string;
  replacement_raw: string;
  base_price: string;
  suffix01_rank: 0 | 1;
  family_root: string;
  family_variant: string;
  model_count: number;
  alias_count: number;
  replacement_count: number;
  source_row_ordinal: number;
  currency_unit: 'UNKNOWN' | 'IRR' | 'TOMAN';
}

export function getActiveVersionId(db: Database.Database): string | null {
  const row = db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null } | undefined;
  return row?.active_version_id ?? null;
}

export function getCatalogueManifest(db: Database.Database, requestedVersion?: string): CatalogueManifest {
  const version = requestedVersion ?? getActiveVersionId(db);
  if (!version) throw new ApiRepositoryError('CATALOG_NOT_READY', 503, 'No published catalogue is available yet.');
  const row = db.prepare(`
    SELECT id, source_sha256, schema_version, normalization_version, rules_version, created_at,
      published_at, price_effective_at, currency_unit, counts_json, status
    FROM catalog_versions WHERE id=?
  `).get(version) as VersionRow | undefined;
  if (!row || row.status !== 'published') {
    throw new ApiRepositoryError('CATALOG_VERSION_UNAVAILABLE', 409, 'This catalogue version is not available.');
  }
  const snapshot = db.prepare('SELECT manifest_sha256 FROM catalog_snapshots WHERE version_id=?').get(version);
  const snapshotManifestPath = snapshot ? `/api/v1/catalog/${version}/snapshot/manifest` : null;
  const counts = JSON.parse(row.counts_json) as Record<string, number | string>;
  return {
    catalogVersion: row.id,
    schemaVersion: row.schema_version,
    normalizationVersion: row.normalization_version,
    rulesVersion: row.rules_version,
    indexFormatVersion: 1,
    sourceSha256: row.source_sha256,
    currencyUnit: row.currency_unit,
    priceEffectiveAt: row.price_effective_at,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    counts,
    snapshotManifestPath,
    rowCount: Number(counts.rows ?? 0),
  };
}

export function listVehicleOptions(db: Database.Database, version: string, query = '', limit = 20, kind?: 'main' | 'other'): VehicleOption[] {
  requirePublishedVersion(db, version);
  if ([...query].length > 128) throw new ApiRepositoryError('INVALID_QUERY', 400, 'Vehicle query must be at most 128 characters.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 80) throw new ApiRepositoryError('INVALID_LIMIT', 400, 'Limit must be an integer from 1 to 80.');
  const whereKind = kind ? ' AND option_kind=?' : '';
  const queryNorm = normalizeText(query);
  const rows = db.prepare(`
    SELECT id, option_kind, label_raw, keywords_raw, display_order
    FROM vehicle_options
    WHERE version_id=? ${whereKind} AND (?='' OR instr(label_norm, ?) > 0 OR instr(keywords_norm, ?) > 0)
    ORDER BY display_order, id LIMIT ?
  `).all(version, ...(kind ? [kind] : []), queryNorm, queryNorm, queryNorm, limit) as Array<{
    id: number; option_kind: 'main' | 'other'; label_raw: string; keywords_raw: string; display_order: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.option_kind,
    labelRaw: row.label_raw,
    keywordsRaw: row.keywords_raw,
    displayOrder: row.display_order,
    models: (db.prepare(`
      SELECT vm.name_raw FROM vehicle_option_models vom
      JOIN vehicle_models vm ON vm.version_id=vom.version_id AND vm.id=vom.model_id
      WHERE vom.version_id=? AND vom.option_id=? ORDER BY vom.ordinal
    `).all(version, row.id) as Array<{ name_raw: string }>).map((model) => model.name_raw),
  }));
}

export function getPresets(db: Database.Database, version: string): Array<{ key: string; label: string; options: VehicleOption[] }> {
  requirePublishedVersion(db, version);
  const families = db.prepare('SELECT family_key, label_raw FROM preset_families WHERE version_id=? ORDER BY display_order').all(version) as Array<{ family_key: string; label_raw: string }>;
  return families.map((family) => {
    const rows = db.prepare(`
      SELECT vo.id, vo.option_kind, vo.label_raw, vo.keywords_raw, vo.display_order
      FROM preset_family_options pfo JOIN vehicle_options vo
        ON vo.version_id=pfo.version_id AND vo.id=pfo.option_id
      WHERE pfo.version_id=? AND pfo.family_key=? ORDER BY pfo.display_order
    `).all(version, family.family_key) as Array<{ id: number; option_kind: 'main' | 'other'; label_raw: string; keywords_raw: string; display_order: number }>;
    const options = rows.map((row) => ({
      id: row.id, kind: row.option_kind, labelRaw: row.label_raw, keywordsRaw: row.keywords_raw,
      displayOrder: row.display_order,
      models: (db.prepare(`
        SELECT vm.name_raw FROM vehicle_option_models vom
        JOIN vehicle_models vm ON vm.version_id=vom.version_id AND vm.id=vom.model_id
        WHERE vom.version_id=? AND vom.option_id=? ORDER BY vom.ordinal
      `).all(version, row.id) as Array<{ name_raw: string }>).map((model) => model.name_raw),
    } satisfies VehicleOption));
    return { key: family.family_key, label: family.label_raw, options };
  });
}

function requirePublishedVersion(db: Database.Database, version: string): void {
  const row = db.prepare('SELECT status FROM catalog_versions WHERE id=?').get(version) as { status: string } | undefined;
  if (!row || row.status !== 'published') throw new ApiRepositoryError('CATALOG_VERSION_UNAVAILABLE', 409, 'This catalogue version is not available.');
}

function loadSummary(db: Database.Database, version: string, entryId: number): EntryRow | undefined {
  return db.prepare(`
    SELECT e.id AS entry_id, e.part_id, pn.name_raw AS part_name_raw, p.tech_raw, e.log_raw,
      e.replacement_raw, CAST(e.base_price AS TEXT) AS base_price, e.suffix01_rank,
      COALESCE(cf.display_root, p.tech_raw) AS family_root,
      COALESCE(cf.variant_label, 'BASE') AS family_variant,
      (SELECT COUNT(*) FROM entry_vehicle_models vm WHERE vm.version_id=e.version_id AND vm.entry_id=e.id) AS model_count,
      (SELECT COUNT(*) FROM entry_aliases a WHERE a.version_id=e.version_id AND a.entry_id=e.id) AS alias_count,
      (SELECT COUNT(*) FROM entry_replacements r WHERE r.version_id=e.version_id AND r.entry_id=e.id) AS replacement_count,
      cv.currency_unit,
      e.source_row_ordinal
    FROM catalog_entries e
    JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
    JOIN part_names pn ON pn.version_id=p.version_id AND pn.id=p.name_id
    JOIN catalog_versions cv ON cv.id=e.version_id
    LEFT JOIN code_family_members cf ON cf.version_id=p.version_id AND cf.part_id=p.id
    WHERE e.version_id=? AND e.id=?
  `).get(version, entryId) as EntryRow | undefined;
}

function summarize(db: Database.Database, version: string, entryId: number): EntrySummary | undefined {
  const row = loadSummary(db, version, entryId);
  if (!row) return undefined;
  const prices = calculatePrices(row.base_price);
  return {
    type: 'entry', entryId: row.entry_id, partId: row.part_id, partNameRaw: row.part_name_raw,
    techRaw: row.tech_raw, logRaw: row.log_raw, replacementRaw: row.replacement_raw,
    matchType: 'nameExact', basePrice: prices.base, middlePrice: prices.middle, finalPrice: prices.final,
    currencyUnit: row.currency_unit, suffix01Rank: row.suffix01_rank,
    family: { root: row.family_root, variant: row.family_variant, verified: false },
    modelCount: row.model_count, aliasCount: row.alias_count, replacementCount: row.replacement_count,
  };
}

function withoutMatchType<T extends { matchType: unknown }>(summary: T): Omit<T, 'matchType'> {
  const { matchType, ...listing } = summary;
  void matchType;
  return listing;
}

export function getEntryDetail(db: Database.Database, version: string, entryId: number): EntryDetail {
  requirePublishedVersion(db, version);
  if (!Number.isSafeInteger(entryId) || entryId < 1) throw new ApiRepositoryError('INVALID_ENTRY_ID', 400, 'Entry ID must be a positive safe integer.');
  const summary = summarize(db, version, entryId);
  if (!summary) throw new ApiRepositoryError('ENTRY_NOT_FOUND', 404, 'Catalogue entry was not found.');
  const models = db.prepare(`
    SELECT vm.name_raw FROM entry_vehicle_models evm
    JOIN vehicle_models vm ON vm.version_id=evm.version_id AND vm.id=evm.model_id
    WHERE evm.version_id=? AND evm.entry_id=? ORDER BY evm.ordinal
  `).all(version, entryId) as Array<{ name_raw: string }>;
  const friendly = db.prepare('SELECT label_raw FROM entry_friendly_labels WHERE version_id=? AND entry_id=? ORDER BY ordinal').all(version, entryId) as Array<{ label_raw: string }>;
  const aliases = db.prepare('SELECT alias_raw FROM entry_aliases WHERE version_id=? AND entry_id=? ORDER BY ordinal').all(version, entryId) as Array<{ alias_raw: string }>;
  const replacements = db.prepare(`
    SELECT r.token_raw, p.tech_raw AS target_tech_raw
    FROM entry_replacements r LEFT JOIN parts p ON p.version_id=r.version_id AND p.id=r.target_part_id
    WHERE r.version_id=? AND r.entry_id=? ORDER BY r.ordinal
  `).all(version, entryId) as Array<{ token_raw: string; target_tech_raw: string | null }>;
  const row = loadSummary(db, version, entryId);
  const detailSummary = withoutMatchType(summary);
  return {
    ...detailSummary,
    models: models.map((item) => item.name_raw),
    friendlyLabels: friendly.map((item) => item.label_raw),
    aliases: aliases.map((item) => item.alias_raw),
    replacementTokens: replacements.map((item) => ({ raw: item.token_raw, targetTechRaw: item.target_tech_raw })),
    sourceRowOrdinal: row?.source_row_ordinal ?? 0,
  };
}

export function listPartEntries(db: Database.Database, version: string, partId: number, limit = 10, cursor?: string): EntryListingPage {
  requirePublishedVersion(db, version);
  if (!Number.isSafeInteger(partId) || partId < 1) throw new ApiRepositoryError('INVALID_PART_ID', 400, 'Part ID must be a positive safe integer.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiRepositoryError('INVALID_LIMIT', 400, 'Limit must be an integer from 1 to 50.');
  if (!db.prepare('SELECT id FROM parts WHERE version_id=? AND id=?').get(version, partId)) {
    throw new ApiRepositoryError('PART_NOT_FOUND', 404, 'Catalogue part was not found.');
  }
  let offset = 0;
  if (cursor) {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new ApiRepositoryError('INVALID_CURSOR', 400, 'Cursor is malformed.');
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { version?: string; partId?: number; offset?: number };
      if (parsed.version !== version || parsed.partId !== partId || !Number.isSafeInteger(parsed.offset) || (parsed.offset ?? -1) < 0) {
        throw new Error('cursor context mismatch');
      }
      offset = parsed.offset as number;
    } catch {
      throw new ApiRepositoryError('INVALID_CURSOR', 400, 'Cursor does not match this version and part.');
    }
  }
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM catalog_entries WHERE version_id=? AND part_id=?').get(version, partId) as { count: number };
  const totalEntries = totalRow.count;
  const rows = db.prepare(`
    SELECT id FROM catalog_entries WHERE version_id=? AND part_id=?
    ORDER BY suffix01_rank, base_price DESC, source_row_ordinal, id LIMIT ? OFFSET ?
  `).all(version, partId, limit, offset) as Array<{ id: number }>;
  const items: EntryListing[] = rows.flatMap(({ id }) => {
    const summary = summarize(db, version, id);
    if (!summary) return [];
    return [withoutMatchType(summary)];
  });
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < totalEntries
    ? Buffer.from(JSON.stringify({ version, partId, offset: nextOffset })).toString('base64url')
    : null;
  return { catalogVersion: version, partId, items, totalEntries, nextCursor };
}

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { buildPresetFamilies, buildVehicleOptions, calculatePrices, codeFamilyInfo, normalizeCode, normalizeText, suffix01Rank, type LegacyDb, type LegacyRow } from '@partsfinder/domain';
import { openCatalogueDatabase, defaultDataRoot, defaultDatabasePath } from './database.js';
import { extractLegacyDb } from './extract-literal.js';
import { canonicalJson, hashFullDatabase, hashRow, sha256 } from './hash.js';
import { validateLegacyDb } from './validate.js';
import { catalogueCounts, NORMALIZATION_VERSION, RULES_VERSION, SCHEMA_VERSION, replacementTokens, type CatalogueCounts } from './transform.js';
import { verifyCatalogue, type ReconciliationReport } from './verify.js';

const MAX_BATCH_SIZE = 500;
const SOURCE_INVENTORY_PATH = 'PartsFinder-Codex-Architecture/baseline/source-inventory.json';

export interface ImportOptions {
  dbPath?: string;
  dataRoot?: string;
  batchSize?: number;
  dryRun?: boolean;
}

export interface ImportReport {
  versionId: string;
  sourceSha256: string;
  sourceArchivePath: string;
  status: 'validated' | 'dry-run';
  currencyUnit: 'UNKNOWN';
  priceEffectiveAt: null;
  alreadyImported: boolean;
  counts: CatalogueCounts;
  sourceInventory: ReturnType<typeof catalogueCounts>['inventory'];
  baselineComparison: Record<string, unknown>;
  priceRoundingDifferences: number;
  verification: ReconciliationReport;
  reportPath: string | null;
}

interface VersionRow {
  id: string;
  status: string;
  archive_path: string;
  counts_json: string;
}

function versionIdFor(sourceHash: string): string {
  return `${sourceHash}-s${SCHEMA_VERSION}-n${NORMALIZATION_VERSION}-r${RULES_VERSION}`;
}

function assertSafeId(value: number | bigint, description: string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new RangeError(`${description} is outside the JavaScript safe integer range`);
  return numeric;
}

async function archiveSource(sourcePath: string, sourceHash: string, dataRoot: string): Promise<string> {
  const archiveDirectory = join(dataRoot, 'source-archive');
  await mkdir(archiveDirectory, { recursive: true });
  const archivePath = join(archiveDirectory, `${sourceHash}${basename(sourcePath).toLowerCase().endsWith('.html') ? '.html' : '.source'}`);
  try {
    const existing = await readFile(archivePath);
    if (sha256(existing) !== sourceHash) throw new Error(`Source archive hash mismatch at ${archivePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await copyFile(sourcePath, archivePath);
    const copied = await readFile(archivePath);
    if (sha256(copied) !== sourceHash) throw new Error('Source changed while being archived; import stopped');
  }
  return archivePath;
}

function baselineDifference(inventory: ReturnType<typeof catalogueCounts>['inventory'], sourceHash: string): Record<string, unknown> {
  const baselinePath = resolve(process.cwd(), SOURCE_INVENTORY_PATH);
  let baseline: Record<string, unknown> | null = null;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, unknown>;
  } catch {
    baseline = null;
  }
  if (!baseline) return { state: 'baseline_unavailable', sourceSha256: sourceHash };
  const comparisons: Record<string, { expected: unknown; actual: unknown }> = {
    row_count: { expected: baseline.row_count, actual: inventory.rowCount },
    unique_tech: { expected: baseline.unique_tech, actual: inventory.uniqueTech },
    unique_log: { expected: baseline.unique_log, actual: inventory.uniqueLog },
    unique_part_names: { expected: baseline.unique_part_names, actual: inventory.uniquePartNames },
    raw_model_count: { expected: baseline.raw_model_count, actual: inventory.rawModelCount },
    model_links_count_including_order: { expected: baseline.model_links_count_including_order, actual: inventory.modelLinks },
    friendly_links_count_including_order: { expected: baseline.friendly_links_count_including_order, actual: inventory.friendlyLinks },
    alias_links_count_including_order: { expected: baseline.alias_links_count_including_order, actual: inventory.aliasLinks },
    rows_with_replacement: { expected: baseline.rows_with_replacement, actual: inventory.rowsWithReplacement },
    source_price_sum_exact_integer: { expected: baseline.source_price_sum_exact_integer, actual: inventory.sourcePriceSum },
  };
  const differences = Object.fromEntries(Object.entries(comparisons).filter(([, item]) => item.expected !== item.actual));
  return {
    state: baseline.sha256 === sourceHash && Object.keys(differences).length === 0 ? 'exact_baseline_match' : 'source_or_inventory_differs',
    baselineSha256: baseline.sha256,
    sourceSha256: sourceHash,
    differences,
  };
}

function metadataJson(db: LegacyDb): Array<[string, string]> {
  return Object.entries(db)
    .filter(([key]) => key !== 'rows')
    .map(([key, value]) => [key, canonicalJson(value)]);
}

function addSearchDocument(
  db: Database.Database,
  versionId: string,
  kind: 'name' | 'alias' | 'tech' | 'log' | 'replacement',
  rawValue: string,
  documents: Map<string, number>,
  insertDocument: Database.Statement,
  insertFts: Database.Statement,
): number | null {
  const normalizedValue = kind === 'name' || kind === 'alias' ? normalizeText(rawValue) : normalizeCode(rawValue);
  if (!normalizedValue) return null;
  const key = `${kind}\0${normalizedValue}`;
  const cached = documents.get(key);
  if (cached !== undefined) return cached;
  const result = insertDocument.run(versionId, kind, rawValue, normalizedValue);
  const id = assertSafeId(result.lastInsertRowid, 'Search document ID');
  insertFts.run(id, normalizedValue);
  documents.set(key, id);
  return id;
}

function insertCatalogueData(db: Database.Database, versionId: string, source: LegacyDb, batchSize: number): void {
  const insertMetadata = db.prepare('INSERT INTO catalog_metadata(version_id, metadata_key, value_json) VALUES (?, ?, ?)');
  for (const [key, value] of metadataJson(source)) insertMetadata.run(versionId, key, value);

  const namesByRaw = new Map<string, number>();
  const insertName = db.prepare('INSERT INTO part_names(version_id, name_raw, name_norm, name_sort_rank) VALUES (?, ?, ?, ?)');
  source.parts.forEach((name, index) => {
    if (namesByRaw.has(name)) throw new Error(`Duplicate exact source part name: ${name}`);
    const inserted = insertName.run(versionId, name, normalizeText(name), index);
    namesByRaw.set(name, assertSafeId(inserted.lastInsertRowid, 'Part name ID'));
  });

  const techNames = new Map<string, string>();
  for (const row of source.rows) {
    const previous = techNames.get(row.tech);
    if (previous !== undefined && previous !== row.part) {
      throw new Error(`Conflicting part names for technical code ${row.tech}: ${previous} / ${row.part}`);
    }
    techNames.set(row.tech, row.part);
  }

  const partIdsByTech = new Map<string, number>();
  const insertPart = db.prepare('INSERT INTO parts(version_id, tech_raw, tech_norm, name_id, tech_sort_rank) VALUES (?, ?, ?, ?, ?)');
  let techRank = 0;
  for (const [tech, name] of techNames) {
    const nameId = namesByRaw.get(name);
    if (nameId === undefined) throw new Error(`Source row part name is missing from DB.parts: ${name}`);
    const result = insertPart.run(versionId, tech, normalizeCode(tech), nameId, techRank++);
    partIdsByTech.set(tech, assertSafeId(result.lastInsertRowid, 'Part ID'));
  }

  const vehicleProjection = buildVehicleOptions(source);
  const allModelNames = new Set<string>();
  for (const row of source.rows) for (const model of row.models) allModelNames.add(model);
  for (const option of vehicleProjection.primary) for (const model of option.models) allModelNames.add(model);
  for (const option of vehicleProjection.others) allModelNames.add(option);

  const modelIds = new Map<string, number>();
  const insertModel = db.prepare('INSERT INTO vehicle_models(version_id, name_raw, name_norm) VALUES (?, ?, ?)');
  for (const model of allModelNames) {
    const result = insertModel.run(versionId, model, normalizeText(model));
    modelIds.set(model, assertSafeId(result.lastInsertRowid, 'Vehicle model ID'));
  }

  const insertEntry = db.prepare(`
    INSERT INTO catalog_entries(version_id, part_id, log_raw, log_norm, base_price,
      replacement_raw, source_row_ordinal, source_row_sha256, suffix01_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEntryModel = db.prepare('INSERT INTO entry_vehicle_models(version_id, entry_id, ordinal, model_id) VALUES (?, ?, ?, ?)');
  const insertFriendly = db.prepare('INSERT INTO entry_friendly_labels(version_id, entry_id, ordinal, label_raw, label_norm) VALUES (?, ?, ?, ?, ?)');
  const insertAlias = db.prepare('INSERT INTO entry_aliases(version_id, entry_id, ordinal, alias_raw, alias_norm) VALUES (?, ?, ?, ?, ?)');
  const insertReplacement = db.prepare('INSERT INTO entry_replacements(version_id, entry_id, ordinal, token_raw, token_norm, target_part_id) VALUES (?, ?, ?, ?, ?, ?)');
  const insertDocument = db.prepare('INSERT INTO search_documents(version_id, kind, raw_value, normalized_value) VALUES (?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO search_fts(rowid, normalized_value) VALUES (?, ?)');
  const insertEntryDocument = db.prepare('INSERT OR IGNORE INTO entry_search_documents(version_id, entry_id, doc_id) VALUES (?, ?, ?)');
  const documents = new Map<string, number>();

  const insertBatch = db.transaction((batch: Array<{ row: LegacyRow; ordinal: number }>) => {
    for (const { row, ordinal } of batch) {
      const partId = partIdsByTech.get(row.tech);
      if (partId === undefined) throw new Error(`Missing part row for technical code ${row.tech}`);
      const inserted = insertEntry.run(versionId, partId, row.log, normalizeCode(row.log), BigInt(row.price), row.replacement, ordinal, hashRow(row), suffix01Rank(row));
      const entryId = assertSafeId(inserted.lastInsertRowid, 'Catalogue entry ID');
      for (const [index, model] of row.models.entries()) {
        const modelId = modelIds.get(model);
        if (modelId === undefined) throw new Error(`Missing vehicle model ${model}`);
        insertEntryModel.run(versionId, entryId, index, modelId);
      }
      for (const [index, label] of row.friendly.entries()) insertFriendly.run(versionId, entryId, index, label, normalizeText(label));
      for (const [index, alias] of row.aliases.entries()) insertAlias.run(versionId, entryId, index, alias, normalizeText(alias));
      for (const [index, token] of replacementTokens(row.replacement).entries()) {
        const targetPartId = partIdsByTech.get(token) ?? null;
        insertReplacement.run(versionId, entryId, index, token, normalizeCode(token), targetPartId);
      }

      const relatedDocuments = new Set<number>();
      const add = (kind: 'name' | 'alias' | 'tech' | 'log' | 'replacement', raw: string) => {
        const id = addSearchDocument(db, versionId, kind, raw, documents, insertDocument, insertFts);
        if (id !== null) relatedDocuments.add(id);
      };
      add('name', row.part);
      add('tech', row.tech);
      add('log', row.log);
      for (const alias of row.aliases) add('alias', alias);
      for (const token of replacementTokens(row.replacement)) add('replacement', token);
      for (const docId of relatedDocuments) insertEntryDocument.run(versionId, entryId, docId);
    }
  });

  for (let start = 0; start < source.rows.length; start += batchSize) {
    const batch = source.rows.slice(start, start + batchSize).map((row, index) => ({ row, ordinal: start + index + 1 }));
    insertBatch.immediate(batch);
  }

  const insertOption = db.prepare(`
    INSERT INTO vehicle_options(version_id, option_kind, label_raw, label_norm, keywords_raw,
      keywords_norm, display_order, source_option_ordinal, canonicalization_provenance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOptionModel = db.prepare('INSERT INTO vehicle_option_models(version_id, option_id, ordinal, model_id) VALUES (?, ?, ?, ?)');
  const insertOptionWithModels = (kind: 'main' | 'other', label: string, keywords: string, values: string[], order: number, sourceOrdinal: number, provenance: string) => {
    const result = insertOption.run(versionId, kind, label, normalizeText(label), keywords, normalizeText(keywords), order, sourceOrdinal, provenance);
    const optionId = assertSafeId(result.lastInsertRowid, 'Vehicle option ID');
    values.forEach((model, ordinal) => {
      const modelId = modelIds.get(model);
      if (modelId === undefined) throw new Error(`Missing option vehicle model ${model}`);
      insertOptionModel.run(versionId, optionId, ordinal, modelId);
    });
  };

  const presetFamilies = buildPresetFamilies(vehicleProjection.primary);
  vehicleProjection.primary.forEach((option, displayOrder) => {
    const sourceOrdinal = source.primaryOptions.findIndex((candidate) => candidate.label === option.label);
    const rawOption = source.primaryOptions[sourceOrdinal];
    const provenance = rawOption && canonicalJson(rawOption.models) !== canonicalJson(option.models) ? 'canonicalize_tiggo7_pro_max_to_awd' : 'source';
    insertOptionWithModels('main', option.label, option.keywords ?? '', option.models, displayOrder, sourceOrdinal, provenance);
  });
  vehicleProjection.others.forEach((label, displayOrder) => {
    const sourceOrdinal = source.others.indexOf(label);
    insertOptionWithModels('other', label, '', [label], displayOrder, sourceOrdinal, 'source');
  });

  const insertFamily = db.prepare('INSERT INTO preset_families(version_id, family_key, label_raw, display_order) VALUES (?, ?, ?, ?)');
  const insertFamilyOption = db.prepare('INSERT INTO preset_family_options(version_id, family_key, option_id, display_order) VALUES (?, ?, ?, ?)');
  const mainOptions = db.prepare('SELECT id, label_raw FROM vehicle_options WHERE version_id=? AND option_kind=\'main\' ORDER BY display_order').all(versionId) as Array<{ id: number; label_raw: string }>;
  const optionIdsByLabel = new Map(mainOptions.map((option) => [option.label_raw, option.id]));
  presetFamilies.forEach((family, displayOrder) => {
    insertFamily.run(versionId, family.key, family.label, displayOrder);
    family.options.forEach((option, optionOrder) => {
      const optionId = optionIdsByLabel.get(option.label);
      if (optionId === undefined) throw new Error(`Preset references a missing option: ${option.label}`);
      insertFamilyOption.run(versionId, family.key, optionId, optionOrder);
    });
  });

  const insertCodeFamily = db.prepare(`
    INSERT INTO code_family_members(version_id, part_id, display_root, variant_label, rule_version, provenance, verified)
    VALUES (?, ?, ?, ?, ?, 'legacy_heuristic', 0)
  `);
  for (const [tech, partId] of partIdsByTech) {
    const family = codeFamilyInfo(tech);
    insertCodeFamily.run(versionId, partId, family.root, family.variant, RULES_VERSION);
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function getExistingVersion(dbPath: string, versionId: string): Promise<VersionRow | undefined> {
  const db = openCatalogueDatabase(dbPath);
  try {
    return db.prepare('SELECT id, status, archive_path, counts_json FROM catalog_versions WHERE id=?').get(versionId) as VersionRow | undefined;
  } finally {
    db.close();
  }
}

export async function importCatalogue(inputPath: string, options: ImportOptions = {}): Promise<ImportReport> {
  const sourcePath = resolve(inputPath);
  const dbPath = resolve(options.dbPath ?? defaultDatabasePath());
  const dataRoot = resolve(options.dataRoot ?? defaultDataRoot());
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  const sourceArchivePath = options.dryRun
    ? join(dataRoot, 'source-archive', `${sourceSha256}${basename(sourcePath).toLowerCase().endsWith('.html') ? '.html' : '.source'}`)
    : await archiveSource(sourcePath, sourceSha256, dataRoot);
  const db = extractLegacyDb(sourceBytes.toString('utf8'));
  validateLegacyDb(db);
  const { inventory: sourceInventory, counts } = catalogueCounts(db);
  const payloadHash = hashFullDatabase(db);
  const versionId = versionIdFor(sourceSha256);
  const baselineComparison = baselineDifference(sourceInventory, sourceSha256);
  const baselineState = baselineComparison.state;
  const baselineSha256 = baselineComparison.baselineSha256;
  if (baselineState === 'source_or_inventory_differs' && baselineSha256 === sourceSha256) {
    throw new Error('Source SHA matches the supplied baseline but its inventory differs; refusing to import a contradictory baseline');
  }
  const priceRoundingDifferences = db.rows.reduce((mismatches, row) => {
    const calculated = calculatePrices(String(row.price));
    return mismatches + Number(calculated.middle !== String(Math.round(row.price * 1.1))) + Number(calculated.final !== String(Math.round(row.price * 1.2)));
  }, 0);

  if (options.dryRun) {
    const verification = {
      versionId, sourceSha256, databaseSourceSha256: sourceSha256, sourceShaMatches: true,
      rowHashMismatches: 0, fullRowsHashMatch: false, metadataHashMatch: false, fullDatabaseHashMatch: false,
      fieldHashMatches: { part: false, models: false, tech: false, log: false, price: false, replacement: false, friendly: false, aliases: false },
      storedRowHashMismatches: 0, integrityCheck: 'not_run', foreignKeyViolations: 0,
      normalizedTechCollisionGroups: 0, normalizedLogCollisionGroups: 0, priceRoundingDifferences,
      counts,
    } as ReconciliationReport;
    return { versionId, sourceSha256, sourceArchivePath, status: 'dry-run', currencyUnit: 'UNKNOWN', priceEffectiveAt: null, alreadyImported: false, counts, sourceInventory, baselineComparison, priceRoundingDifferences, verification, reportPath: null };
  }

  const existing = await getExistingVersion(dbPath, versionId);
  if (existing && ['validated', 'published'].includes(existing.status)) {
    const verification = await verifyCatalogue(versionId, { dbPath, sourcePath });
    if (!verification.fullDatabaseHashMatch || verification.rowHashMismatches || verification.foreignKeyViolations || verification.integrityCheck !== 'ok') {
      throw new Error(`Existing catalogue version failed verification: ${versionId}`);
    }
    return { versionId, sourceSha256, sourceArchivePath: existing.archive_path, status: 'validated', currencyUnit: 'UNKNOWN', priceEffectiveAt: null, alreadyImported: true, counts, sourceInventory, baselineComparison, priceRoundingDifferences, verification, reportPath: null };
  }

  let database: Database.Database | undefined;
  let runId: number | null = null;
  try {
    database = openCatalogueDatabase(dbPath);
    const activeVersion = (database.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null } | undefined)?.active_version_id;
    if (existing && existing.status !== 'failed' && existing.id === activeVersion) {
      throw new Error('Refusing to restart an active catalogue version');
    }
    if (existing) {
      database.prepare('DELETE FROM search_fts WHERE rowid IN (SELECT id FROM search_documents WHERE version_id=?)').run(versionId);
      database.prepare('DELETE FROM catalog_versions WHERE id=? AND status IN (\'staging\',\'failed\')').run(versionId);
    }

    const startedAt = new Date().toISOString();
    const run = database.prepare(`
      INSERT INTO import_runs(source_sha256, source_archive_path, started_at, status, target_version)
      VALUES (?, ?, ?, 'running', ?)
    `).run(sourceSha256, sourceArchivePath, startedAt, versionId);
    runId = assertSafeId(run.lastInsertRowid, 'Import run ID');

    database.prepare(`
      INSERT INTO catalog_versions(id, source_sha256, archive_path, schema_version, normalization_version,
        rules_version, created_at, published_at, price_effective_at, currency_unit, counts_json, status, payload_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'UNKNOWN', ?, 'staging', ?)
    `).run(versionId, sourceSha256, sourceArchivePath, SCHEMA_VERSION, NORMALIZATION_VERSION, RULES_VERSION, startedAt, JSON.stringify(counts), payloadHash);

    const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, options.batchSize ?? MAX_BATCH_SIZE));
    insertCatalogueData(database, versionId, db, batchSize);
    database.close();
    database = undefined;

    const verification = await verifyCatalogue(versionId, { dbPath, sourcePath, allowStaging: true });
    const verificationPass = verification.sourceShaMatches && verification.rowHashMismatches === 0
      && verification.storedRowHashMismatches === 0 && verification.fullRowsHashMatch && verification.metadataHashMatch
      && verification.fullDatabaseHashMatch && Object.values(verification.fieldHashMatches).every(Boolean)
      && verification.integrityCheck === 'ok' && verification.foreignKeyViolations === 0
      && verification.priceRoundingDifferences === 0;
    if (!verificationPass) throw new Error(`Staged catalogue reconciliation failed: ${JSON.stringify(verification)}`);

    database = openCatalogueDatabase(dbPath);
    const validatedAt = new Date().toISOString();
    const reportPath = join(dataRoot, 'imports', versionId, 'migration-report.json');
    const report: ImportReport = {
      versionId, sourceSha256, sourceArchivePath, status: 'validated', currencyUnit: 'UNKNOWN', priceEffectiveAt: null,
      alreadyImported: false, counts, sourceInventory, baselineComparison, priceRoundingDifferences, verification, reportPath,
    };
    await writeJson(join(dataRoot, 'imports', versionId, 'source-inventory.json'), { sourceSha256, ...sourceInventory, counts, baselineComparison });
    await writeJson(reportPath, report);
    const activeDatabase = database;
    activeDatabase.transaction(() => {
      activeDatabase.prepare("UPDATE catalog_versions SET status='validated' WHERE id=? AND status='staging'").run(versionId);
      activeDatabase.prepare("UPDATE import_runs SET ended_at=?, status='succeeded', warnings_json=?, errors_json='[]', report_path=? WHERE id=?").run(
        validatedAt,
        JSON.stringify(sourceInventory.unknownTopLevelKeys.length ? [`Retained unknown top-level fields: ${sourceInventory.unknownTopLevelKeys.join(', ')}`] : []),
        reportPath,
        runId,
      );
    }).immediate();
    return report;
  } catch (error) {
    if (database?.open) database.close();
    database = openCatalogueDatabase(dbPath);
    database.transaction(() => {
      database?.prepare("UPDATE catalog_versions SET status='failed' WHERE id=? AND status='staging'").run(versionId);
      const message = error instanceof Error ? error.message : String(error);
      if (runId !== null) database?.prepare("UPDATE import_runs SET ended_at=?, status='failed', errors_json=? WHERE id=?").run(new Date().toISOString(), JSON.stringify([message]), runId);
    }).immediate();
    throw error;
  } finally {
    if (database?.open) database.close();
  }
}

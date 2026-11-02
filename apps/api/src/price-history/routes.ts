import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { HistoryMetrics, PriceHistoryEntryDto, PriceHistoryListDto, PriceHistoryObservationDto, PriceHistorySettings, PriceHistorySummaryDto, PriceHistorySummaryItem } from '../../../../packages/contracts/src/price-history.js';
import { calculateHistoryMetrics, DEFAULT_PRICE_HISTORY_SETTINGS, parseEffectiveDate } from '../../../../packages/domain/src/price-history.js';

type Query = Record<string, unknown>;
class HistoryReadError extends Error { constructor(readonly code: string, readonly statusCode: number, message: string) { super(message); } }
const fail = (code: string, status: number, message: string): never => { throw new HistoryReadError(code, status, message); };
const versionProperty = { type: 'string', minLength: 1, maxLength: 180 };
const cursorProperty = { type: 'string', maxLength: 1024, pattern: '^[A-Za-z0-9_-]+$' };
interface MetricRow { entry_id: number; metrics_json: string; classification: 'high' | 'medium' | 'low' | 'neutral' }

function integer(value: unknown, fallback: number, maximum: number, minimum = 1): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fail('INVALID_QUERY', 400, `Integer value must be from ${minimum} to ${maximum}.`);
  return parsed;
}
function string(value: unknown): string | undefined { if (value === undefined) return undefined; if (typeof value !== 'string') return fail('INVALID_QUERY', 400, 'Query value must be a string.'); return value; }
function versionOf(query: Query, catalogue: Database.Database): string {
  const version = string(query.version);
  if (!version || version.length > 180) return fail('VERSION_REQUIRED', 400, 'An explicit catalogue version is required.');
  if (!catalogue.prepare("SELECT id FROM catalog_versions WHERE id=? AND status='published'").get(version)) return fail('CATALOG_VERSION_UNAVAILABLE', 409, 'This catalogue version is not available.');
  return version;
}
function cursorOffset(value: unknown, context: Record<string, unknown>): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return fail('INVALID_CURSOR', 400, 'History cursor is malformed.');
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { context?: unknown; offset?: unknown };
    if (JSON.stringify(decoded.context) !== JSON.stringify(context)) return fail('STALE_HISTORY_CURSOR', 409, 'History changed or this cursor belongs to another query; restart the page.');
    return integer(decoded.offset, 0, 10000000, 0);
  } catch (error) { if (error instanceof HistoryReadError) throw error; return fail('INVALID_CURSOR', 400, 'History cursor is malformed.'); }
}
function cursor(context: Record<string, unknown>, offset: number): string { return Buffer.from(JSON.stringify({ context, offset })).toString('base64url'); }
function requireEntry(catalogue: Database.Database, version: string, entryId: number): void {
  if (!catalogue.prepare('SELECT id FROM catalog_entries WHERE version_id=? AND id=?').get(version, entryId)) fail('ENTRY_NOT_FOUND', 404, 'Catalogue entry was not found in this version.');
}
function meta(operations: Database.Database | null): { revision: number; settings: PriceHistorySettings } {
  if (!operations) return { revision: 0, settings: { ...DEFAULT_PRICE_HISTORY_SETTINGS } };
  const row = operations.prepare('SELECT revision,settings_json FROM ph_meta WHERE singleton=1').get() as { revision: number; settings_json: string | null };
  return { revision: row.revision, settings: row.settings_json ? JSON.parse(row.settings_json) as PriceHistorySettings : { ...DEFAULT_PRICE_HISTORY_SETTINGS } };
}
function summary(operations: Database.Database | null, version: string, entryId: number): PriceHistorySummaryItem {
  const row = operations?.prepare('SELECT entry_id,metrics_json,classification FROM ph_metrics WHERE catalogue_version=? AND entry_id=?').get(version, entryId) as MetricRow | undefined;
  return { entryId, ...row ? JSON.parse(row.metrics_json) as HistoryMetrics : calculateHistoryMetrics([]), classification: row?.classification ?? 'neutral' };
}

/** Read only, bounded routes. Imports, corrections, settings and restore remain local CLI operations. */
export function registerPriceHistoryRoutes(server: FastifyInstance, options: { cataloguePath: string; operationsPath: string }): void {
  const read = <T>(handler: (request: FastifyRequest, catalogue: Database.Database, operations: Database.Database | null) => T) => (request: FastifyRequest, reply: FastifyReply): T | FastifyReply => {
    let catalogue: Database.Database | undefined;
    let operations: Database.Database | null = null;
    try {
      catalogue = new Database(options.cataloguePath, { readonly: true, fileMustExist: true });
      if (existsSync(options.operationsPath)) {
        operations = new Database(options.operationsPath, { readonly: true, fileMustExist: true });
        operations.pragma('busy_timeout=1000');
        if (!operations.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ph_meta'").get()) { operations.close(); operations = null; }
      }
      // SQLite snapshot prevents a concurrent commit from mixing revision, summary and timeline.
      if (operations) operations.exec('BEGIN');
      const response = handler(request, catalogue, operations);
      reply.header('cache-control', 'private, no-store');
      return response;
    } catch (error) {
      if (error instanceof HistoryReadError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      if (error instanceof TypeError) return reply.code(400).send({ error: { code: 'INVALID_QUERY', message: 'Historical query contains an invalid date or value.' } });
      return reply.code(503).send({ error: { code: 'HISTORY_UNAVAILABLE', message: 'Historical prices are temporarily unavailable.' } });
    } finally { if (operations?.inTransaction) operations.exec('ROLLBACK'); operations?.close(); catalogue?.close(); }
  };
  server.get('/api/v1/price-history/summary', { schema: { querystring: { type: 'object', required: ['version', 'ids'], additionalProperties: false, properties: { version: versionProperty, ids: { type: 'string', maxLength: 400, pattern: '^[0-9]+(?:,[0-9]+)*$' } } } } }, read((request, catalogue, operations): PriceHistorySummaryDto => {
    const query = request.query as Query;
    const catalogVersion = versionOf(query, catalogue);
    const idsText = string(query.ids) ?? '';
    const rawIds = idsText.split(',');
    if (rawIds.length < 1 || rawIds.length > 20) fail('INVALID_IDS', 400, 'Summary accepts 1 to 20 catalogue entry IDs.');
    const ids = [...new Set(rawIds.map(id => integer(id, 0, Number.MAX_SAFE_INTEGER)))];
    for (const id of ids) requireEntry(catalogue, catalogVersion, id);
    return { catalogVersion, ...meta(operations), items: ids.map(id => summary(operations, catalogVersion, id)) };
  }));
  server.get('/api/v1/price-history/entries/:id', { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 16 } } }, querystring: { type: 'object', required: ['version'], additionalProperties: false, properties: { version: versionProperty, limit: { type: 'integer', minimum: 1, maximum: 50 }, cursor: cursorProperty } } } }, read((request, catalogue, operations): PriceHistoryEntryDto => {
    const query = request.query as Query;
    const catalogVersion = versionOf(query, catalogue);
    const entryId = integer((request.params as { id: string }).id, 0, Number.MAX_SAFE_INTEGER);
    requireEntry(catalogue, catalogVersion, entryId);
    const limit = integer(query.limit, 50, 50);
    const context = { catalogVersion, entryId, revision: meta(operations).revision };
    const offset = cursorOffset(query.cursor, context);
    const rows = operations?.prepare(`SELECT o.id AS observationId,o.batch_id AS batchId,o.effective_date AS effectiveDate,o.normalized_price AS price,o.raw_price AS rawPrice,o.currency_unit AS currencyUnit,o.technical_raw AS technicalCodeRaw,o.logistics_raw AS logisticsCodeRaw,s.filename AS sourceFileName,s.sha256 AS sourceSha256,o.source_sheet AS sourceSheet,o.source_row AS sourceRow,o.match_status AS matchStatus
      FROM ph_observations o JOIN ph_batches b ON b.id=o.batch_id JOIN ph_batch_state bs ON bs.batch_id=b.id JOIN ph_sources s ON s.sha256=b.source_sha256
      WHERE b.catalogue_version=? AND bs.status='active' AND o.entry_id=? AND o.match_status LIKE 'matched_%' AND o.normalized_price IS NOT NULL
      ORDER BY o.effective_date IS NULL,o.effective_date DESC,o.id DESC LIMIT ? OFFSET ?`).all(catalogVersion, entryId, limit + 1, offset) as PriceHistoryObservationDto[] | undefined;
    return { catalogVersion, entryId, summary: summary(operations, catalogVersion, entryId), observations: rows?.slice(0, limit) ?? [], nextCursor: (rows?.length ?? 0) > limit ? cursor(context, offset + limit) : null };
  }));
  server.get('/api/v1/price-history/entries', { schema: { querystring: { type: 'object', required: ['version'], additionalProperties: false, properties: {
    version: versionProperty, limit: { type: 'integer', minimum: 1, maximum: 20 }, cursor: cursorProperty,
    sort: { enum: ['growth', 'date'] }, classification: { enum: ['high', 'medium', 'low', 'neutral'] }, minimumObservations: { type: 'integer', minimum: 0, maximum: 100000 }, from: { type: 'string', maxLength: 10 }, to: { type: 'string', maxLength: 10 },
  } } } }, read((request, catalogue, operations): PriceHistoryListDto => {
    const query = request.query as Query;
    const catalogVersion = versionOf(query, catalogue);
    const limit = integer(query.limit, 20, 20);
    const sort = string(query.sort) ?? 'growth';
    const classification = string(query.classification) ?? null;
    const minimumObservations = integer(query.minimumObservations, 0, 100000, 0);
    const from = query.from === undefined ? null : parseEffectiveDate(query.from);
    const to = query.to === undefined ? null : parseEffectiveDate(query.to);
    if (from && to && from > to) fail('INVALID_DATE_RANGE', 400, 'History date range is reversed.');
    const state = meta(operations);
    const context = { catalogVersion, revision: state.revision, sort, classification, minimumObservations, from, to };
    const offset = cursorOffset(query.cursor, context);
    if (!operations) return { catalogVersion, ...state, items: [], totalEntries: 0, nextCursor: null };
    // Date bounds select the latest explicit observation date; metrics always describe full history.
    const where = 'catalogue_version=? AND observation_count>=? AND (? IS NULL OR classification=?) AND (? IS NULL OR last_date>=?) AND (? IS NULL OR last_date<=?)';
    const parameters = [catalogVersion, minimumObservations, classification, classification, from, from, to, to];
    const totalEntries = (operations.prepare(`SELECT count(*) AS n FROM ph_metrics WHERE ${where}`).get(...parameters) as { n: number }).n;
    const order = sort === 'date' ? 'last_date DESC,entry_id' : 'growth_rank,entry_id';
    const rows = operations.prepare(`SELECT entry_id,metrics_json,classification FROM ph_metrics WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...parameters, limit, offset) as MetricRow[];
    const identity = catalogue.prepare('SELECT n.name_raw AS partNameRaw,p.tech_raw AS techRaw,e.log_raw AS logRaw,CAST(e.base_price AS TEXT) AS basePrice FROM catalog_entries e JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id JOIN part_names n ON n.version_id=p.version_id AND n.id=p.name_id WHERE e.version_id=? AND e.id=?');
    return { catalogVersion, ...state, totalEntries, items: rows.map(row => ({ entryId: row.entry_id, ...JSON.parse(row.metrics_json) as HistoryMetrics, classification: row.classification, ...identity.get(catalogVersion, row.entry_id) as { partNameRaw: string; techRaw: string; logRaw: string; basePrice: string } })), nextCursor: offset + rows.length < totalEntries ? cursor(context, offset + rows.length) : null };
  }));
}

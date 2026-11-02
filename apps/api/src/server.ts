import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import type { SearchKind, SearchMode, SearchRequest } from '@partsfinder/contracts';
import { ApiRepositoryError, getActiveVersionId, getCatalogueManifest, getEntryDetail, getPresets, listPartEntries, listVehicleOptions } from './repository.js';
import { SearchWorkerClient } from './search/worker-client.js';
import { getSnapshotChunk, getSnapshotManifest, SnapshotAccessError } from './snapshots.js';
import { registerPriceHistoryRoutes } from './price-history/routes.js';
import { accessFromEnvironment, registerAccess, validateAccessConfiguration, type AccessConfiguration } from './access.js';
import { registerWeb } from './web.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

interface ServerOptions {
  databasePath?: string;
  operationsPath?: string;
  dataRoot?: string;
  logger?: boolean;
  maxSearchQueue?: number;
  webRoot?: string;
  access?: AccessConfiguration;
}

const entrySummarySchema = {
  type: 'object',
  properties: {
    type: { const: 'entry' }, entryId: { type: 'integer' }, partId: { type: 'integer' },
    partNameRaw: { type: 'string' }, techRaw: { type: 'string' }, logRaw: { type: 'string' },
    replacementRaw: { type: 'string' }, matchType: { type: 'string' }, basePrice: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' },
    middlePrice: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' }, finalPrice: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' },
    currencyUnit: { enum: ['UNKNOWN', 'IRR', 'TOMAN'] }, suffix01Rank: { enum: [0, 1] },
    family: { type: 'object', properties: { root: { type: 'string' }, variant: { type: 'string' }, verified: { const: false } }, required: ['root', 'variant', 'verified'] },
    modelCount: { type: 'integer', minimum: 0 }, aliasCount: { type: 'integer', minimum: 0 }, replacementCount: { type: 'integer', minimum: 0 },
  },
  required: ['type', 'entryId', 'partId', 'partNameRaw', 'techRaw', 'logRaw', 'replacementRaw', 'matchType', 'basePrice', 'middlePrice', 'finalPrice', 'currencyUnit', 'suffix01Rank', 'family', 'modelCount', 'aliasCount', 'replacementCount'],
} as const;

const searchItemSchema = {
  oneOf: [
    entrySummarySchema,
    { type: 'object', properties: { type: { const: 'variant' }, partId: { type: 'integer' }, techRaw: { type: 'string' }, partNameRaw: { type: 'string' }, matchedEntryCount: { type: 'integer' } }, required: ['type', 'partId', 'techRaw', 'partNameRaw', 'matchedEntryCount'] },
    { type: 'object', properties: { type: { const: 'family' }, displayRoot: { type: 'string' }, representative: entrySummarySchema, matchedEntryCount: { type: 'integer' }, variantCount: { type: 'integer' }, verified: { const: false } }, required: ['type', 'displayRoot', 'representative', 'matchedEntryCount', 'variantCount', 'verified'] },
  ],
} as const;

const searchPageSchema = {
  type: 'object',
  properties: {
    catalogVersion: { type: 'string' }, normalizationVersion: { type: 'integer' },
    items: { type: 'array', items: searchItemSchema }, totalMatchedEntries: { type: 'integer', minimum: 0 },
    totalMatchedVariants: { type: 'integer', minimum: 0 },
    totalMatchedFamilies: { type: 'integer', minimum: 0 },
    nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['catalogVersion', 'normalizationVersion', 'items', 'totalMatchedEntries', 'nextCursor'],
} as const;

const errorSchema = {
  type: 'object', properties: { error: { type: 'object', properties: {
    code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object', additionalProperties: true },
  }, required: ['code', 'message'] } }, required: ['error'],
} as const;

function queryRecord(request: { query: unknown }): Record<string, unknown> {
  return request.query as Record<string, unknown>;
}

function queryString(query: Record<string, unknown>, key: string, fallback?: string): string | undefined {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new ApiRepositoryError('INVALID_QUERY', 400, `${key} must be a string.`);
  return value;
}

function queryInteger(query: Record<string, unknown>, key: string, fallback: number, minimum: number, maximum: number): number {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new ApiRepositoryError('INVALID_QUERY', 400, `${key} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiRepositoryError('INVALID_QUERY', 400, `${key} must be from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function requiredVersion(query: Record<string, unknown>, db: Database.Database): string {
  const value = queryString(query, 'version');
  return value ?? getActiveVersionId(db) ?? (() => { throw new ApiRepositoryError('CATALOG_NOT_READY', 503, 'No published catalogue is available yet.'); })();
}

function requestFromQuery(query: Record<string, unknown>, db: Database.Database, overrides: Partial<SearchRequest> = {}): SearchRequest {
  const version = queryString(query, 'version') ?? getActiveVersionId(db);
  if (!version) throw new ApiRepositoryError('CATALOG_NOT_READY', 503, 'No published catalogue is available yet.');
  const rawMode = queryString(query, 'mode', 'global');
  if (rawMode !== 'global' && rawMode !== 'vehiclePart') throw new ApiRepositoryError('INVALID_SEARCH_REQUEST', 400, 'Unsupported search mode.');
  const rawKind = queryString(query, 'kind', 'auto');
  if (rawKind !== 'auto' && rawKind !== 'code' && rawKind !== 'name') throw new ApiRepositoryError('INVALID_SEARCH_REQUEST', 400, 'Unsupported search kind.');
  const rawGroup = queryString(query, 'groupBy', 'entry');
  if (rawGroup !== 'entry' && rawGroup !== 'family' && rawGroup !== 'variant') throw new ApiRepositoryError('INVALID_SEARCH_REQUEST', 400, 'Unsupported result grouping.');
  const vehicleOptionId = query.vehicleOptionId === undefined
    ? undefined
    : queryInteger(query, 'vehicleOptionId', 0, 1, Number.MAX_SAFE_INTEGER);
  const limit = queryInteger(query, 'limit', 20, 1, 100);
  const cursor = queryString(query, 'cursor');
  const search: SearchRequest = {
    catalogVersion: version,
    mode: rawMode as SearchMode,
    kind: rawKind as SearchKind,
    query: queryString(query, 'q', '') ?? '',
    groupBy: rawGroup,
    limit,
    ...(vehicleOptionId !== undefined ? { vehicleOptionId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(query.familyRoot !== undefined ? { familyRoot: queryString(query, 'familyRoot')! } : {}),
    ...(query.partId !== undefined ? { partId: queryInteger(query, 'partId', 0, 1, Number.MAX_SAFE_INTEGER) } : {}),
    ...overrides,
  };
  return search;
}

export async function createServer(options: ServerOptions = {}): Promise<ReturnType<typeof Fastify>> {
  const access = options.access ? validateAccessConfiguration(options.access) : accessFromEnvironment(process.env);
  const databasePath = resolve(workspaceRoot, options.databasePath ?? process.env.CATALOGUE_DB_PATH ?? 'private-data/sqlite/catalogue.db');
  const dataRoot = resolve(workspaceRoot, options.dataRoot ?? process.env.CATALOGUE_DATA_ROOT ?? 'private-data');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 1000');
  db.pragma('foreign_keys = ON');
  const searchWorker = new SearchWorkerClient(databasePath, options.maxSearchQueue ?? 64);
  await searchWorker.waitUntilReady();

  const server = Fastify({
    logger: false,
    trustProxy: false,
    requestIdHeader: 'x-request-id',
    bodyLimit: 65_536,
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
    keepAliveTimeout: 5_000,
    forceCloseConnections: 'idle',
  });

  registerAccess(server, access);

  server.addHook('onResponse', async (request, reply) => {
    if (options.logger === false) return;
    process.stdout.write(`${JSON.stringify({ requestId: request.id, method: request.method, path: request.routeOptions.url, statusCode: reply.statusCode })}\n`);
  });

  server.setErrorHandler((error, request, reply) => {
    const known = error as Error & { code?: string; statusCode?: number };
    const statusCode = known.statusCode && known.statusCode >= 400 && known.statusCode < 600 ? known.statusCode : 500;
    const code = known.code ?? 'INTERNAL_SERVER_ERROR';
    const message = statusCode === 500 ? 'The request could not be completed.' : known.message;
    if (statusCode >= 500 && options.logger !== false) process.stderr.write(`${JSON.stringify({ requestId: request.id, code })}\n`);
    reply.status(statusCode).send({ error: { code, message, ...(statusCode >= 500 ? { details: { requestId: request.id } } : {}) } });
  });

  server.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route was not found.' } });
  });

  server.get('/health/live', { schema: { response: { 200: { type: 'object', properties: { status: { const: 'live' } }, required: ['status'] } } } }, async () => ({ status: 'live' }));
  server.get('/health/ready', async (_request, reply) => {
    try {
      const manifest = getCatalogueManifest(db);
      return { status: 'ready', catalogVersion: manifest.catalogVersion };
    } catch (error) {
      if (error instanceof ApiRepositoryError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });

  server.get('/api/v1/openapi.json', async () => ({
    openapi: '3.1.0',
    info: { title: 'PartsFinder Catalogue API', version: '1.0.0' },
    paths: {
      '/health/live': { get: { responses: { '200': { description: 'Process is alive.' } } } },
      '/health/ready': { get: { responses: { '200': { description: 'A published catalogue is ready.' }, '503': { description: 'No active catalogue.' } } } },
      '/api/v1/catalog/manifest': { get: { responses: { '200': { description: 'Active catalogue metadata.' } } } },
      '/api/v1/catalog/{version}/manifest': { get: { responses: { '200': { description: 'Pinned catalogue metadata.' }, '409': { description: 'Version unavailable.' } } } },
      '/api/v1/vehicles': { get: { responses: { '200': { description: 'Bounded vehicle options.' } } } },
      '/api/v1/presets': { get: { responses: { '200': { description: 'Vehicle preset families.' } } } },
      '/api/v1/parts/suggestions': { get: { responses: { '200': { description: 'Bounded part-name suggestions.' } } } },
      '/api/v1/search': { get: { responses: { '200': { description: 'Version-pinned search page.' }, '400': { description: 'Invalid query or cursor.' }, '409': { description: 'Catalogue version unavailable.' }, '503': { description: 'Search queue is busy.' } } } },
      '/api/v1/entries/{id}': { get: { responses: { '200': { description: 'One lazy entry detail.' }, '404': { description: 'Entry not found.' } } } },
      '/api/v1/families/{root}/variants': { get: { responses: { '200': { description: 'Bounded matching variants.' } } } },
      '/api/v1/parts/{id}/entries': { get: { responses: { '200': { description: 'Bounded logistics entries.' } } } },
      '/api/v1/catalog/{version}/snapshot/manifest': { get: { responses: { '200': { description: 'Immutable offline snapshot manifest.' }, '404': { description: 'Snapshot unavailable.' } } } },
      '/api/v1/catalog/{version}/snapshot/chunks/{chunkId}': { get: { responses: { '200': { description: 'One hash-verified snapshot chunk.' }, '404': { description: 'Chunk unavailable.' } } } },
    },
  }));

  server.get('/api/v1/catalog/manifest', { schema: { response: { 200: { type: 'object', additionalProperties: true }, 304: { type: 'null' } } } }, async (request, reply) => {
    const manifest = getCatalogueManifest(db);
    const tag = `"${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}"`;
    reply.header('etag', tag).header('cache-control', 'private, max-age=0, must-revalidate');
    if (request.headers['if-none-match'] === tag) return reply.code(304).send();
    return manifest;
  });

  server.get<{ Params: { version: string } }>('/api/v1/catalog/:version/manifest', async (request, reply) => {
    const manifest = getCatalogueManifest(db, request.params.version);
    const tag = `"${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}"`;
    reply.header('etag', tag).header('cache-control', 'private, max-age=0, must-revalidate');
    if (request.headers['if-none-match'] === tag) return reply.code(304).send();
    return manifest;
  });

  server.get<{ Params: { version: string } }>('/api/v1/catalog/:version/snapshot/manifest', async (request, reply) => {
    getCatalogueManifest(db, request.params.version);
    let snapshot;
    try {
      snapshot = await getSnapshotManifest(db, request.params.version, dataRoot);
    } catch (error) {
      if (error instanceof SnapshotAccessError) throw error;
      throw error;
    }
    const tag = `"${snapshot.sha256}"`;
    reply.header('etag', tag).header('cache-control', 'private, max-age=31536000, immutable');
    if (request.headers['if-none-match'] === tag) return reply.code(304).send();
    return snapshot.manifest;
  });

  server.get<{ Params: { version: string; chunkId: string } }>('/api/v1/catalog/:version/snapshot/chunks/:chunkId', async (request, reply) => {
    getCatalogueManifest(db, request.params.version);
    let chunk;
    try {
      chunk = await getSnapshotChunk(db, request.params.version, request.params.chunkId, dataRoot);
    } catch (error) {
      if (error instanceof SnapshotAccessError) throw error;
      throw error;
    }
    const tag = `"${chunk.sha256}"`;
    reply.type('application/x-ndjson; charset=utf-8')
      .header('content-length', chunk.bytes.byteLength)
      .header('etag', tag)
      .header('cache-control', 'private, max-age=31536000, immutable');
    if (request.headers['if-none-match'] === tag) return reply.code(304).send();
    return reply.send(chunk.bytes);
  });

  server.get('/api/v1/vehicles', async (request) => {
    const query = queryRecord(request);
    const version = requiredVersion(query, db);
    const kindText = queryString(query, 'kind');
    if (kindText !== undefined && kindText !== 'main' && kindText !== 'other') throw new ApiRepositoryError('INVALID_QUERY', 400, 'kind must be main or other.');
    return listVehicleOptions(db, version, queryString(query, 'q', '') ?? '', queryInteger(query, 'limit', 20, 1, 80), kindText);
  });

  server.get('/api/v1/presets', async (request) => {
    const version = requiredVersion(queryRecord(request), db);
    return getPresets(db, version);
  });

  server.get('/api/v1/parts/suggestions', async (request) => {
    const query = queryRecord(request);
    const search = requestFromQuery(query, db, {
      mode: 'vehiclePart', kind: 'name', groupBy: 'entry',
      vehicleOptionId: queryInteger(query, 'vehicleOptionId', 0, 1, Number.MAX_SAFE_INTEGER),
      limit: queryInteger(query, 'limit', 20, 1, 80),
      query: queryString(query, 'q', '') ?? '',
    });
    const page = await searchWorker.search(search, request.raw.aborted ? new AbortController().signal : undefined);
    return [...new Set(page.items.flatMap((item) => item.type === 'entry' ? [item.partNameRaw] : []))].slice(0, search.limit);
  });

  server.get('/api/v1/search', { schema: { response: { 200: searchPageSchema, 400: errorSchema, 409: errorSchema, 503: errorSchema, 500: errorSchema } } }, async (request) => {
    const search = requestFromQuery(queryRecord(request), db);
    const controller = new AbortController();
    request.raw.once('aborted', () => controller.abort());
    return searchWorker.search(search, controller.signal);
  });

  server.get('/api/v1/entries/:id', async (request) => {
    const query = queryRecord(request);
    const version = queryString(query, 'version');
    if (!version) throw new ApiRepositoryError('INVALID_QUERY', 400, 'version is required.');
    const params = request.params as { id: string };
    if (!/^\d+$/.test(params.id)) throw new ApiRepositoryError('INVALID_ENTRY_ID', 400, 'Entry ID must be a positive integer.');
    return getEntryDetail(db, version, Number(params.id));
  });

  server.get('/api/v1/families/:root/variants', async (request) => {
    const query = queryRecord(request);
    const root = (request.params as { root: string }).root;
    const search = requestFromQuery(query, db, {
      groupBy: 'variant', familyRoot: root,
      limit: queryInteger(query, 'limit', 10, 1, 50),
    });
    const controller = new AbortController();
    request.raw.once('aborted', () => controller.abort());
    return searchWorker.search(search, controller.signal);
  });

  server.get('/api/v1/parts/:id/entries', async (request) => {
    const params = request.params as { id: string };
    if (!/^\d+$/.test(params.id)) throw new ApiRepositoryError('INVALID_PART_ID', 400, 'Part ID must be a positive integer.');
    const query = queryRecord(request);
    const version = queryString(query, 'version');
    if (!version) throw new ApiRepositoryError('INVALID_QUERY', 400, 'version is required.');
    return listPartEntries(db, version, Number(params.id), queryInteger(query, 'limit', 10, 1, 50), queryString(query, 'cursor'));
  });

  registerPriceHistoryRoutes(server,{cataloguePath:databasePath,operationsPath:resolve(workspaceRoot,options.operationsPath ?? process.env.PARTAVAR_OPERATIONS_PATH ?? (options.databasePath ? resolve(dirname(databasePath),'operations.db') : 'private-data/sqlite/operations.db'))});
  server.addHook('onClose', async () => {
    db.close();
    await searchWorker.close();
  });
  if (options.webRoot) {
    try { await registerWeb(server, options.webRoot); }
    catch (error) { await server.close(); throw error; }
  }
  return server;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? '8787');
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be from 1 to 65535.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('The backend must bind to loopback; use the HTTPS reverse proxy for network access.');
  const server = await createServer({ webRoot: resolve(workspaceRoot, process.env.PARTAVAR_WEB_ROOT ?? 'apps/web/dist') });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void server.close().catch(() => { process.exitCode = 1; });
  });
  await server.listen({ port, host });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

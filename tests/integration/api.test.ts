import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { importCatalogue } from '../../packages/importer/src/import.js';

let root = '';
let version = '';
let entryId = 0;
let partId = 0;
let vehicleOptionId = 0;
let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'partsfinder-api-'));
  const source = join(root, 'fixture.html');
  const fixture = {
    rows: [
      { part: 'Brake sensor', models: ['Model A'], tech: 'TECH-01', log: 'LOG-01', price: 900719925474100, replacement: 'ALT-01/ALT-02', friendly: ['ABS'], aliases: ['brake switch'] },
      { part: 'Brake sensor', models: [], tech: 'TECH-01', log: 'LOG-02', price: 2000, replacement: '', friendly: [], aliases: [] },
    ],
    parts: ['Brake sensor'], primary: [], others: [], groups: {},
    primaryOptions: [{ label: 'Model A', models: ['Model A'] }],
  };
  await writeFile(source, `<script>const DB=${JSON.stringify(fixture)};</script>`);
  const dbPath = join(root, 'catalogue.db');
  const imported = await importCatalogue(source, { dbPath, dataRoot: root });
  version = imported.versionId;
  const db = new Database(dbPath);
  db.prepare("UPDATE catalog_versions SET status='published', published_at=? WHERE id=?").run(new Date().toISOString(), version);
  db.prepare('UPDATE catalog_state SET active_version_id=? WHERE singleton=1').run(version);
  entryId = (db.prepare('SELECT id FROM catalog_entries WHERE version_id=? AND log_raw=?').get(version, 'LOG-01') as { id: number }).id;
  partId = (db.prepare('SELECT id FROM parts WHERE version_id=? AND tech_raw=?').get(version, 'TECH-01') as { id: number }).id;
  vehicleOptionId = (db.prepare('SELECT id FROM vehicle_options WHERE version_id=? AND label_raw=?').get(version, 'Model A') as { id: number }).id;
  db.close();
  server = await createServer({ databasePath: dbPath, logger: false });
});

afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('Fastify catalogue API', () => {
  it('serves health and a bounded active manifest with ETag revalidation', async () => {
    expect((await server.inject('/health/live')).json()).toEqual({ status: 'live' });
    expect((await server.inject('/health/ready')).json()).toEqual({ status: 'ready', catalogVersion: version });

    const first = await server.inject('/api/v1/catalog/manifest');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ catalogVersion: version, rowCount: 2, currencyUnit: 'UNKNOWN' });
    const second = await server.inject({ url: '/api/v1/catalog/manifest', headers: { 'if-none-match': first.headers.etag as string } });
    expect(second.statusCode).toBe(304);
  });

  it('searches through the Worker and returns version-pinned pages', async () => {
    const response = await server.inject(`/api/v1/search?version=${version}&mode=global&kind=code&q=TECH-01&limit=1`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      catalogVersion: version,
      totalMatchedEntries: 2,
      items: [{ type: 'entry', logRaw: 'LOG-01', matchType: 'technicalExact' }],
    });
    const body = response.json() as { nextCursor: string | null };
    expect(body.nextCursor).toBeTruthy();
    const next = await server.inject(`/api/v1/search?version=${version}&mode=global&kind=code&q=TECH-01&limit=1&cursor=${encodeURIComponent(body.nextCursor ?? '')}`);
    expect(next.json()).toMatchObject({ items: [{ logRaw: 'LOG-02' }] });
  });

  it('keeps lazy details and vehicle filtering scoped to their source entry', async () => {
    const detail = await server.inject(`/api/v1/entries/${entryId}?version=${version}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      logRaw: 'LOG-01',
      models: ['Model A'],
      friendlyLabels: ['ABS'],
      aliases: ['brake switch'],
      replacementTokens: [
        { raw: 'ALT-01/ALT-02', targetTechRaw: null },
      ],
      basePrice: '900719925474100',
      middlePrice: '990791918021510',
      finalPrice: '1080863910568920',
    });

    const page = await server.inject(`/api/v1/search?version=${version}&mode=vehiclePart&kind=name&vehicleOptionId=${vehicleOptionId}&q=brake&limit=10`);
    expect(page.json()).toMatchObject({ totalMatchedEntries: 1, items: [{ logRaw: 'LOG-01' }] });
  });

  it('returns one matching variant with independent bounded logistics entries', async () => {
    const detail = (await server.inject(`/api/v1/entries/${entryId}?version=${version}`)).json();
    const variants = await server.inject(`/api/v1/families/${encodeURIComponent(detail.family.root)}/variants?version=${version}&q=TECH-01&limit=10`);
    expect(variants.statusCode).toBe(200);
    expect(variants.json()).toMatchObject({ totalMatchedEntries: 2, totalMatchedVariants: 1, items: [{ type: 'variant', partId, matchedEntryCount: 2 }] });
    expect(variants.json().items[0]).not.toHaveProperty('basePrice');
    const scoped = await server.inject(`/api/v1/search?version=${version}&q=TECH&partId=${partId}&familyRoot=${encodeURIComponent(detail.family.root)}&limit=1`);
    expect(scoped.json()).toMatchObject({ totalMatchedEntries: 2, items: [{ partId, logRaw: 'LOG-01' }] });
  });

  it('returns stable errors for empty search and missing details', async () => {
    const empty = await server.inject(`/api/v1/search?version=${version}&q=%20%20`);
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'INVALID_SEARCH_REQUEST' } });
    const missing = await server.inject(`/api/v1/entries/999999?version=${version}`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'ENTRY_NOT_FOUND' } });
  });

  it('lists model options and paged logistics siblings', async () => {
    const vehicles = await server.inject(`/api/v1/vehicles?version=${version}`);
    expect(vehicles.json()).toMatchObject([{ labelRaw: 'Model A', kind: 'main', models: ['Model A'] }]);
    const first = await server.inject(`/api/v1/parts/${partId}/entries?version=${version}&limit=1`);
    expect(first.json()).toMatchObject({ totalEntries: 2, items: [{ logRaw: 'LOG-01' }] });
    const cursor = (first.json() as { nextCursor: string }).nextCursor;
    const second = await server.inject(`/api/v1/parts/${partId}/entries?version=${version}&limit=1&cursor=${encodeURIComponent(cursor)}`);
    expect(second.json()).toMatchObject({ items: [{ logRaw: 'LOG-02' }] });
  });
});

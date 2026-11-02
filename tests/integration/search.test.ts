import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { searchCatalogue } from '../../apps/api/src/search/search.js';
import type { EntrySummary, SearchPage, SearchRequest } from '../../packages/contracts/src/index.js';

let root = '';
let db: Database.Database;
let version = '';
let options = new Map<string, number>();

const fixture = {
  rows: [
    { part: 'سنسور دمای موتور', models: ['Model A'], tech: 'TECH-01', log: 'LOG-01', price: 1000, replacement: 'ALT-01', friendly: ['Model A'], aliases: ['Engine', 'temperature'] },
    { part: 'سنسور دمای موتور', models: ['Model B'], tech: 'TECH-01', log: 'LOG-02', price: 2000, replacement: '', friendly: ['Model B'], aliases: ['engine temperature sensor'] },
    { part: 'sensor 2 brake', models: ['Model A'], tech: 'TECH-02', log: 'LOG-03', price: 3000, replacement: '', friendly: [], aliases: ['ABS Sensor'] },
    { part: 'قطعه ۲', models: ['Model A'], tech: 'TECH-03', log: 'LOG-04', price: 4000, replacement: '', friendly: [], aliases: [] },
  ],
  parts: ['سنسور دمای موتور', 'sensor 2 brake', 'قطعه ۲'],
  primary: [],
  others: [],
  groups: {},
  primaryOptions: [
    { label: 'Model A', models: ['Model A'] },
    { label: 'Model B', models: ['Model B'] },
  ],
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'partsfinder-search-'));
  const source = join(root, 'fixture.html');
  await writeFile(source, `<script>const DB=${JSON.stringify(fixture)};</script>`);
  const imported = await importCatalogue(source, { dbPath: join(root, 'catalogue.db'), dataRoot: root });
  version = imported.versionId;
  db = new Database(join(root, 'catalogue.db'));
  db.prepare("UPDATE catalog_versions SET status='published', published_at=? WHERE id=?").run(new Date().toISOString(), version);
  db.prepare('UPDATE catalog_state SET active_version_id=? WHERE singleton=1').run(version);
  const vehicleOptions = db.prepare('SELECT id, label_raw FROM vehicle_options WHERE version_id=?').all(version) as Array<{ id: number; label_raw: string }>;
  options = new Map(vehicleOptions.map(({ id, label_raw }) => [label_raw, id]));
});

afterAll(async () => {
  db?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    catalogVersion: version,
    mode: 'global',
    kind: 'auto',
    query: 'LOG-01',
    groupBy: 'entry',
    limit: 20,
    ...overrides,
  };
}

function entryItems(page: SearchPage): EntrySummary[] {
  return page.items.filter((item): item is EntrySummary => item.type === 'entry');
}

describe('indexed catalogue search', () => {
  it('paginates unique technical variants in best-child order without family prices', async () => {
    const entries = entryItems(await searchCatalogue(db, request({ query: 'TECH', kind: 'code' })));
    const expected = [...new Set(entries.map(entry => entry.partId))];
    const ids: number[] = []; let cursor: string | undefined;
    do {
      const page = await searchCatalogue(db, request({ query: 'TECH', kind: 'code', groupBy: 'variant', limit: 1, ...(cursor ? { cursor } : {}) }));
      expect(page.totalMatchedVariants).toBe(3);
      expect(page.totalMatchedEntries).toBe(4);
      expect(page.items).toHaveLength(1);
      const item = page.items[0]!;
      expect(item.type).toBe('variant');
      expect(item).not.toHaveProperty('basePrice');
      if (item.type === 'variant') ids.push(item.partId);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(expected);
  });

  it('ranks exact logistics and replacement matches as separate source entries', async () => {
    const exactLog = await searchCatalogue(db, request({ query: 'LOG-01' }));
    expect(entryItems(exactLog).map((item) => item.logRaw)).toEqual(['LOG-01']);
    expect(entryItems(exactLog)[0]?.matchType).toBe('logisticsExact');

    const replacement = await searchCatalogue(db, request({ query: 'ALT-01' }));
    expect(entryItems(replacement).map((item) => item.logRaw)).toEqual(['LOG-01']);
    expect(entryItems(replacement)[0]?.matchType).toBe('replacementExact');
  });

  it('matches all name terms across aliases and preserves entry-local vehicles/prices', async () => {
    const page = await searchCatalogue(db, request({ query: 'engine temperature', kind: 'name' }));
    expect(entryItems(page).map((item) => item.logRaw)).toEqual(['LOG-02', 'LOG-01']);
    expect(entryItems(page).find((item) => item.logRaw === 'LOG-01')?.basePrice).toBe('1000');
    expect(entryItems(page).find((item) => item.logRaw === 'LOG-02')?.basePrice).toBe('2000');

    const vehiclePage = await searchCatalogue(db, request({
      mode: 'vehiclePart', kind: 'name', query: 'engine temperature',
      vehicleOptionId: options.get('Model A') ?? 0,
    }));
    expect(entryItems(vehiclePage).map((item) => item.logRaw)).toEqual(['LOG-01']);
  });

  it('normalizes Persian digits and offers explicit name search alongside auto search', async () => {
    const page = await searchCatalogue(db, request({ query: 'قطعه 2', kind: 'name' }));
    expect(entryItems(page).map((item) => item.techRaw)).toEqual(['TECH-03']);
  });

  it('keeps code exact/prefix/infix results in deterministic order', async () => {
    const exact = await searchCatalogue(db, request({ mode: 'global', kind: 'code', query: 'TECH-01', limit: 10 }));
    expect(entryItems(exact).map((item) => item.logRaw)).toEqual(['LOG-02', 'LOG-01']);
    expect(entryItems(exact).every((item) => item.matchType === 'technicalExact')).toBe(true);
    const prefix = await searchCatalogue(db, request({ mode: 'global', kind: 'code', query: 'TECH', limit: 10 }));
    expect(entryItems(prefix)).toHaveLength(4);
    expect(entryItems(prefix).every((item) => item.matchType === 'technicalPrefix')).toBe(true);
    const infix = await searchCatalogue(db, request({ mode: 'global', kind: 'code', query: 'ECH-0', limit: 10 }));
    expect(entryItems(infix)).toHaveLength(4);
    expect(new Set(entryItems(infix).map((item) => item.techRaw))).toEqual(new Set(['TECH-01', 'TECH-02', 'TECH-03']));
    expect(entryItems(infix).every((item) => item.matchType === 'technicalInfix')).toBe(true);
  });

  it('pins cursors to version, query, filters, and stable sort order', async () => {
    const first = await searchCatalogue(db, request({ query: 'sensor', kind: 'name', limit: 1 }));
    expect(first.items).toHaveLength(1);
    const firstEntry = entryItems(first)[0];
    const nextCursor = first.nextCursor;
    expect(nextCursor).toBeTruthy();
    if (!firstEntry || !nextCursor) throw new Error('Expected a first page and next cursor.');
    const second = await searchCatalogue(db, request({ query: 'sensor', kind: 'name', limit: 1, cursor: nextCursor }));
    expect(second.items).toHaveLength(1);
    expect(entryItems(second)[0]?.entryId).not.toBe(firstEntry.entryId);
    await expect(searchCatalogue(db, request({ query: 'brake', kind: 'name', limit: 1, cursor: nextCursor })))
      .rejects.toThrow(/cursor/i);
  });

  it('rejects empty, overlong, unsupported and missing-vehicle requests', async () => {
    await expect(searchCatalogue(db, request({ query: '   ' }))).rejects.toMatchObject({ code: 'INVALID_SEARCH_REQUEST' });
    await expect(searchCatalogue(db, request({ query: 'a'.repeat(129) }))).rejects.toMatchObject({ code: 'INVALID_SEARCH_REQUEST' });
    await expect(searchCatalogue(db, request({ mode: 'vehiclePart', query: 'engine' }))).rejects.toMatchObject({ code: 'INVALID_SEARCH_REQUEST' });
  });
});

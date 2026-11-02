import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { stagePriceHistory as stageOriginal, commitPriceHistory, rollbackPriceHistory, previewPriceHistory, backupPriceHistory, restorePriceHistory, setPriceHistorySettings } from '../../packages/importer/src/price-history/index.js';
import { registerPriceHistoryRoutes } from '../../apps/api/src/price-history/routes.js';
import { runPriceHistoryCli } from '../../packages/importer/src/price-history/cli.js';

let root = '';
let cataloguePath = '';
let operationsPath = '';
let version = '';
let entryId = 0;
const mapping = { sheet: 'PriceHistory', headerRow: 1, columns: { technicalCode: 'A', logisticsCode: 'B', price: 'C', effectiveDate: 'D' }, currencyUnit: 'IRR' as const };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fixtureReports: unknown[] = [];
async function stagePriceHistory(options: Parameters<typeof stageOriginal>[0]) {
  const report = await stageOriginal(options);
  fixtureReports.push(report);
  return report;
}
async function workbook(name: string, rows: unknown[][]): Promise<string> {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Notes').addRow(['TEST FIXTURE ONLY: fabricated prices, never production history']);
  const sheet = book.addWorksheet('PriceHistory');
  sheet.addRow(['Technical', 'Logistics', 'Price', 'Date']);
  for (const row of rows) sheet.addRow(row);
  const path = join(root, name);
  await book.xlsx.writeFile(path);
  return path;
}
async function server() {
  const app = Fastify();
  registerPriceHistoryRoutes(app, { cataloguePath, operationsPath });
  await app.ready();
  return app;
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'partavar-history-test-'));
  cataloguePath = join(root, 'catalogue.db');
  operationsPath = join(root, 'operations.db');
  const rows = [
    { part: 'Brake', models: [], tech: '001TECH', log: '00001', price: 100, replacement: '', friendly: [], aliases: [] },
    { part: 'Brake', models: [], tech: '001TECH', log: '00002', price: 200, replacement: '', friendly: [], aliases: [] },
    { part: 'Sensor', models: [], tech: 'UNIQUE', log: '00003', price: 300, replacement: '', friendly: [], aliases: [] },
  ];
  const source = join(root, 'fixture.html');
  await writeFile(source, `<script>const DB=${JSON.stringify({ rows, parts: ['Brake', 'Sensor'], primary: [], others: [], groups: {}, primaryOptions: [] })};</script>`);
  version = (await importCatalogue(source, { dbPath: cataloguePath, dataRoot: root })).versionId;
  const db = new Database(cataloguePath);
  db.prepare("UPDATE catalog_versions SET status='published',published_at=? WHERE id=?").run(new Date().toISOString(), version);
  db.prepare('UPDATE catalog_state SET active_version_id=?').run(version);
  entryId = (db.prepare("SELECT id FROM catalog_entries WHERE log_raw='00001'").get() as { id: number }).id;
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
afterAll(async () => {
  await mkdir('reports/partavar', { recursive: true });
  await writeFile('reports/partavar/price-history-fixture-imports.json', JSON.stringify({ generatedAt: new Date().toISOString(), testOnly: true, warning: 'All prices, dates and company source files in these reports are generated test fixtures. No production history has been imported.', batches: fixtureReports }, null, 2));
});

describe('historical XLSX import and bounded reads', () => {
  it('stages immutable XLSX evidence, reports ambiguity, commits explicitly and never writes catalogue', async () => {
    const before = hash(await readFile(cataloguePath));
    const sourcePath = await workbook('test-company-history.xlsx', [
      ['001TECH', '00001', '90071992547409930', '2025-01-01'],
      ['001TECH', '00001', '180143985094819860', '2025-02-01'],
      ['001TECH', '', '123', '2025-03-01'],
      ['UNIQUE', '', '200', null],
      ['001TECH', 'DOES-NOT-EXIST', '100', '2025-01-01'],
      ['001TECH', '00002', '-1', '2025-01-01'],
      ['001TECH', '00002', null, '2025-01-01'],
      ['001TECH', '00001', '90071992547409930', '2025-01-01'],
    ]);
    const staged = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    expect(staged).toMatchObject({ status: 'staged', counts: { matched_exact: 2, matched_unique_technical: 1, ambiguous: 1, unmatched: 1, invalid_price: 2, duplicate: 1 }, sheets: ['Notes', 'PriceHistory'] });
    const replay = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    expect(replay.batchId).toBe(staged.batchId);
    const preview = previewPriceHistory(operationsPath, staged.batchId);
    expect(preview.rows.find(row => row.matchStatus === 'ambiguous')?.candidateEntryIds).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({ logisticsCodeRaw: '00001', normalizedPrice: '90071992547409930', sourceRow: 2 });
    const app = await server();
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json().items[0]).toMatchObject({ evidenceCount: 0, classification: 'neutral' });
    await commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test operator', reason: 'Review fixture preview' });
    await commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test operator', reason: 'Idempotent commit' });
    const summary = (await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json();
    expect(summary.items[0]).toMatchObject({ earliestPrice: '90071992547409930', cumulativeChangeBps: '10000', observationCount: 2, ambiguousCount: 1, classification: 'neutral', neutralReason: 'ambiguous_history' });
    const detail = (await app.inject(`/api/v1/price-history/entries/${entryId}?version=${version}&limit=1`)).json();
    expect(detail.observations).toHaveLength(1);
    expect(detail.observations[0]).toMatchObject({ logisticsCodeRaw: '00001', sourceFileName: 'test-company-history.xlsx', sourceRow: 3 });
    expect(detail).not.toHaveProperty('archivePath');
    expect((await app.inject(`/api/v1/price-history/entries/${entryId}?version=${version}&limit=1&cursor=${detail.nextCursor}`)).json().observations[0].sourceRow).toBe(2);
    expect((await app.inject({ method: 'POST', url: '/api/v1/price-history/import' })).statusCode).toBe(404);
    await app.close();
    expect(hash(await readFile(cataloguePath))).toBe(before);
    const db = new Database(operationsPath);
    expect(() => db.prepare("UPDATE ph_observations SET raw_price='1'").run()).toThrow(/immutable/);
    expect((db.prepare("SELECT count(*) AS n FROM ph_events WHERE action='COMMIT'").get() as { n: number }).n).toBe(1);
    db.close();
  });

  it('audits supersede and rollback, ranks growth and restores a verified backup to a new target', async () => {
    const one = await workbook('test-first.xlsx', [['001TECH', '00001', '100', '2025-01-01'], ['001TECH', '00001', '120', '2025-02-01'], ['001TECH', '00002', '100', '2025-01-01'], ['001TECH', '00002', '110', '2025-02-01']]);
    const first = await stagePriceHistory({ sourcePath: one, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    await commitPriceHistory({ cataloguePath, operationsPath, batchId: first.batchId, actor: 'test', reason: 'First source' });
    const app = await server();
    const firstList = (await app.inject(`/api/v1/price-history/entries?version=${version}&sort=growth&limit=1&classification=medium`)).json();
    expect(firstList.items[0]).toMatchObject({ entryId, techRaw: '001TECH', logRaw: '00001', partNameRaw: 'Brake', basePrice: '100', percentileBps: 10000, cumulativeChangeBps: '2000' });
    const two = await workbook('test-corrected.xlsx', [['001TECH', '00001', '100', '2025-01-01'], ['001TECH', '00001', '140', '2025-02-01']]);
    const second = await stagePriceHistory({ sourcePath: two, cataloguePath, operationsPath, catalogueVersion: version, mapping, supersedesBatchId: first.batchId });
    await commitPriceHistory({ cataloguePath, operationsPath, batchId: second.batchId, actor: 'test', reason: 'Corrected company file' });
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json().items[0].cumulativeChangeBps).toBe('4000');
    await rollbackPriceHistory({ cataloguePath, operationsPath, batchId: second.batchId, actor: 'test', reason: 'Restore previous evidence' });
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json().items[0].cumulativeChangeBps).toBe('2000');
    await setPriceHistorySettings({ cataloguePath, operationsPath, actor: 'test', reason: 'Use percentile', settings: { strategy: 'percentile', mediumBps: 1000, highBps: 3000, mediumPercentileBps: 3333, highPercentileBps: 6667, minimumObservations: 2 } });
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json().items[0].classification).toBe('high');
    const backupPath = join(root, 'backup');
    await backupPriceHistory({ operationsPath, outputPath: backupPath });
    const restoredPath = join(root, 'restored', 'operations.db');
    await restorePriceHistory({ backupPath, operationsPath: restoredPath });
    const restoredApp = Fastify();
    registerPriceHistoryRoutes(restoredApp, { cataloguePath, operationsPath: restoredPath });
    expect((await restoredApp.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json()).toEqual((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json());
    await expect(restorePriceHistory({ backupPath, operationsPath: restoredPath })).rejects.toThrow(/exists/);
    await restoredApp.close();
    await app.close();
  });

  it('rejects legacy XLS, formula cells, unsafe numeric prices, invalid dates and unbounded reads', async () => {
    const legacy = join(root, 'legacy.xls');
    await writeFile(legacy, 'not xlsx');
    await expect(stagePriceHistory({ sourcePath: legacy, cataloguePath, operationsPath, catalogueVersion: version, mapping })).rejects.toThrow(/\.xls/);
    const bad = await workbook('test-invalid.xlsx', [['001TECH', '00001', { formula: '1+1', result: 2 }, '2025-01-01'], ['001TECH', '00001', 9007199254740992, '2025-02-01'], ['001TECH', '00001', '1', '2025-02-29']]);
    const staged = await stagePriceHistory({ sourcePath: bad, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    expect(staged.counts).toMatchObject({ invalid_cell: 1, invalid_price: 1, invalid_date: 1 });
    const app = await server();
    for (const url of [`summary?version=${version}&ids=${Array.from({ length: 21 }, (_, i) => i + 1).join(',')}`, `entries?version=${version}&limit=10000`, `entries?version=${version}&from=2025-02-29`, `entries/${entryId}?version=${version}&cursor=garbage`, `summary?version=missing&ids=${entryId}`]) expect((await app.inject(`/api/v1/price-history/${url}`)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=999999`)).statusCode).toBe(404);
    await app.close();
    const config = join(root, 'mapping.json');
    await writeFile(config, JSON.stringify(mapping));
    const cliPreview = await runPriceHistoryCli(['preview', '--operations', operationsPath, '--batch', staged.batchId]);
    expect(cliPreview).toMatchObject({ batchId: staged.batchId, status: 'staged' });
  });

  it('refuses to activate source archives changed after staging and canonicalizes equivalent column mappings', async () => {
    const sourcePath = await workbook('test-tamper.xlsx', [['001TECH', '00001', '100', '2025-01-01']]);
    const staged = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    const reordered = { ...mapping, columns: { effectiveDate: 'D', price: 'C', logisticsCode: 'B', technicalCode: 'A' } };
    expect((await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping: reordered })).batchId).toBe(staged.batchId);
    await writeFile(join(root, 'price-history-sources', `${staged.sourceSha256}.xlsx`), 'tampered source');
    await expect(commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test', reason: 'Attempt tampered activation' })).rejects.toThrow(/checksum/);
    expect(previewPriceHistory(operationsPath, staged.batchId).status).toBe('staged');
  });

  it('keeps retained catalogue versions isolated and invalidates timeline cursors after audited transitions', async () => {
    const sourcePath = await workbook('test-version-pinning.xlsx', [['001TECH', '00001', '100', '2025-01-01'], ['001TECH', '00001', '120', '2025-02-01']]);
    const staged = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    await commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test', reason: 'First published version' });
    const app = await server();
    const first = (await app.inject(`/api/v1/price-history/entries/${entryId}?version=${version}&limit=1`)).json();
    const legacy = JSON.parse((await readFile(join(root, 'fixture.html'), 'utf8')).slice('<script>const DB='.length, -';</script>'.length)) as { rows: Array<{ price: number }> };
    legacy.rows[0]!.price = 999;
    const secondSource = join(root, 'second.html');
    await writeFile(secondSource, `<script>const DB=${JSON.stringify(legacy)};</script>`);
    const secondVersion = (await importCatalogue(secondSource, { dbPath: cataloguePath, dataRoot: root })).versionId;
    const catalogue = new Database(cataloguePath);
    catalogue.prepare("UPDATE catalog_versions SET status='published' WHERE id=?").run(secondVersion);
    const newId = (catalogue.prepare("SELECT id FROM catalog_entries WHERE version_id=? AND log_raw='00001'").get(secondVersion) as { id: number }).id;
    catalogue.close();
    expect((await app.inject(`/api/v1/price-history/summary?version=${secondVersion}&ids=${newId}`)).json().items[0]).toMatchObject({ classification: 'neutral', evidenceCount: 0 });
    expect((await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${entryId}`)).json().items[0].cumulativeChangeBps).toBe('2000');
    await rollbackPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test', reason: 'Invalidate existing cursor' });
    expect((await app.inject(`/api/v1/price-history/entries/${entryId}?version=${version}&limit=1&cursor=${first.nextCursor}`)).statusCode).toBe(409);
    await app.close();
  });

  it('preserves conflicting same-day evidence, rejects database aliases and verifies backup tampering', async () => {
    const sourcePath = await workbook('test-date-conflict.xlsx', [['001TECH', '00001', '100', '2025-01-01'], ['001TECH', '00001', '150', '2025-01-01'], ['001TECH', '00001', '200', '2025-02-01']]);
    await expect(stagePriceHistory({ sourcePath, cataloguePath, operationsPath: cataloguePath, catalogueVersion: version, mapping })).rejects.toThrow(/separate/);
    const staged = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    await expect(commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: '', reason: 'Missing audit actor' })).rejects.toThrow(/actor/);
    expect(previewPriceHistory(operationsPath, staged.batchId).status).toBe('staged');
    await commitPriceHistory({ operationsPath, cataloguePath, batchId: staged.batchId, actor: 'test', reason: 'Preserve both same-day values' });
    const app = await server();
    const detail = (await app.inject(`/api/v1/price-history/entries/${entryId}?version=${version}`)).json();
    expect(detail.summary).toMatchObject({ classification: 'neutral', neutralReason: 'same_date_conflict', conflictDateCount: 1, cumulativeChangeBps: null });
    expect(detail.observations).toHaveLength(3);
    expect((await app.inject(`/api/v1/price-history/entries?version=${version}&from=2025-03-01`)).json().totalEntries).toBe(0);
    await app.close();
    const backupPath = join(root, 'backup-tamper');
    await backupPriceHistory({ operationsPath, outputPath: backupPath });
    await writeFile(join(backupPath, 'sources', `${staged.sourceSha256}.xlsx`), 'corrupt archive');
    await expect(restorePriceHistory({ backupPath, operationsPath: join(root, 'failed-restore', 'operations.db') })).rejects.toThrow(/checksum/);
  });

  it('verifies predecessor evidence before rollback reinstates a superseded batch', async () => {
    const firstPath = await workbook('test-rollback-original.xlsx', [['001TECH', '00001', '100', '2025-01-01']]);
    const first = await stagePriceHistory({ sourcePath: firstPath, cataloguePath, operationsPath, catalogueVersion: version, mapping });
    await commitPriceHistory({ cataloguePath, operationsPath, batchId: first.batchId, actor: 'test', reason: 'Original reviewed source' });
    const nextPath = await workbook('test-rollback-correction.xlsx', [['001TECH', '00001', '120', '2025-01-01']]);
    const next = await stagePriceHistory({ sourcePath: nextPath, cataloguePath, operationsPath, catalogueVersion: version, mapping, supersedesBatchId: first.batchId });
    await commitPriceHistory({ cataloguePath, operationsPath, batchId: next.batchId, actor: 'test', reason: 'Reviewed replacement' });
    await writeFile(join(root, 'price-history-sources', `${first.sourceSha256}.xlsx`), 'corrupted predecessor');
    await expect(rollbackPriceHistory({ cataloguePath, operationsPath, batchId: next.batchId, actor: 'test', reason: 'Attempt reinstating corrupt evidence' })).rejects.toThrow(/checksum/);
    expect(previewPriceHistory(operationsPath, next.batchId).status).toBe('active');
  });
});

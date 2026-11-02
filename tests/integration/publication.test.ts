import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SnapshotManifest } from '../../packages/contracts/src/index.js';
import { createServer } from '../../apps/api/src/server.js';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { publishCatalogue, rollbackCatalogue } from '../../packages/importer/src/publication.js';

let root = '';
let dbPath = '';
let firstVersion = '';
let secondVersion = '';
let secondLog = '';
let server: Awaited<ReturnType<typeof createServer>>;

function source(part: string, tech: string, log: string) {
  return {
    rows: [{ part, models: ['Model A'], tech, log, price: 1001, replacement: 'UNKNOWN-01', friendly: ['Model A'], aliases: [`${part} alias`] }],
    parts: [part], primary: [], others: [], groups: {},
    primaryOptions: [{ label: 'Model A', models: ['Model A'] }],
  };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'partsfinder-publish-'));
  dbPath = join(root, 'catalogue.db');
  const firstSource = join(root, 'first.html');
  await writeFile(firstSource, `<script>const DB=${JSON.stringify(source('First part', 'TECH-01', 'LOG-01'))};</script>`);
  const importedFirst = await importCatalogue(firstSource, { dbPath, dataRoot: root });
  firstVersion = importedFirst.versionId;
  const publishedFirst = await publishCatalogue(firstVersion, { dbPath, dataRoot: root });
  expect(publishedFirst.roundTripRowsVerified).toBe(1);
  expect(publishedFirst.previousVersionId).toBeNull();

  const secondSource = join(root, 'second.html');
  const secondData = source('Second part', 'TECH-02', 'LOG-02');
  secondLog = secondData.rows[0]!.log;
  await writeFile(secondSource, `<script>const DB=${JSON.stringify(secondData)};</script>`);
  const importedSecond = await importCatalogue(secondSource, { dbPath, dataRoot: root });
  secondVersion = importedSecond.versionId;
  const interruptedDirectory = join(root, 'snapshots', secondVersion);
  await mkdir(interruptedDirectory, { recursive: true });
  await writeFile(join(interruptedDirectory, 'manifest.json'), 'interrupted-publication');
  await expect(publishCatalogue(secondVersion, { dbPath, dataRoot: root })).rejects.toThrow(/incompatible snapshot directory/);
  const db = new Database(dbPath, { readonly: true });
  expect(db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get()).toEqual({ active_version_id: firstVersion });
  db.close();
  await rm(interruptedDirectory, { recursive: true, force: true });

  const publishedSecond = await publishCatalogue(secondVersion, { dbPath, dataRoot: root });
  expect(publishedSecond.previousVersionId).toBe(firstVersion);
  expect(publishedSecond.roundTripRowsVerified).toBe(1);
  server = await createServer({ databasePath: dbPath, dataRoot: root, logger: false });
});

afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('snapshot publication and rollback', () => {
  it('writes typed immutable chunks within the decoded-byte limit and round-trips source rows', async () => {
    const response = await server.inject(`/api/v1/catalog/${secondVersion}/snapshot/manifest`);
    expect(response.statusCode).toBe(200);
    const manifest = response.json() as SnapshotManifest;
    expect(manifest).toMatchObject({ catalogVersion: secondVersion, rowCount: 1, currencyUnit: 'UNKNOWN' });
    expect(manifest.chunks.length).toBeGreaterThan(0);
    expect(manifest.chunks.every((chunk) => chunk.decodedBytes <= 512 * 1024 && chunk.recordCount > 0)).toBe(true);
    expect(manifest.chunks.every((chunk) => chunk.path.startsWith(`/api/v1/catalog/${secondVersion}/snapshot/chunks/`))).toBe(true);

    const entries = manifest.chunks.find((chunk) => chunk.table === 'entries');
    expect(entries).toBeDefined();
    const chunkResponse = await server.inject(entries!.path);
    expect(chunkResponse.statusCode).toBe(200);
    expect(chunkResponse.headers['content-type']).toContain('application/x-ndjson');
    expect(chunkResponse.headers['content-length']).toBe(String(entries!.decodedBytes));
    expect(createHash('sha256').update(chunkResponse.rawPayload).digest('hex')).toBe(entries!.sha256);
    expect(chunkResponse.body).toContain(secondLog);
  });

  it('keeps the prior active version on corrupt rollback and switches atomically to a verified snapshot', async () => {
    const rollback = await rollbackCatalogue(firstVersion, { dbPath, dataRoot: root });
    expect(rollback).toMatchObject({ action: 'rollback', activeVersionId: firstVersion, previousVersionId: secondVersion });
    const repeated = await rollbackCatalogue(firstVersion, { dbPath, dataRoot: root });
    expect(repeated.action).toBe('already-active');

    const db = new Database(dbPath, { readonly: true });
    const chunk = db.prepare('SELECT relative_path FROM catalog_snapshot_chunks WHERE version_id=? LIMIT 1').get(secondVersion) as { relative_path: string };
    db.close();
    await writeFile(join(root, 'snapshots', chunk.relative_path), 'corrupt');
    await expect(rollbackCatalogue(secondVersion, { dbPath, dataRoot: root })).rejects.toThrow(/hash or byte count mismatch/);
    const check = new Database(dbPath, { readonly: true });
    expect(check.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get()).toEqual({ active_version_id: firstVersion });
    check.close();
  });
});

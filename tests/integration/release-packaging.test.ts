import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { publishCatalogue } from '../../packages/importer/src/publication.js';
import { openPriceHistoryDatabase } from '../../packages/importer/src/price-history/database.js';
import { packageRelease } from '../../scripts/release/package.js';
import { verifyRelease } from '../../scripts/release/verify.js';

const run = promisify(execFile);
const bundledPython = resolve(dirname(process.execPath), '../../python/bin/python3');
const python = process.env.PARTAVAR_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python3');
let temporary = '';
let root = '';
let archive = '';
let version = '';
let sourceArchive = '';
let writer: Database.Database;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'partavar release $ literal '));
  root = join(temporary, 'source');
  archive = join(temporary, "PartAvar ' literal $.zip");
  const fixture = { rows: [{ part: 'Brake sensor', models: ['Model A'], tech: 'TECH-01', log: 'LOG-01', price: 1001, replacement: '', friendly: ['ABS'], aliases: ['brake switch'] }], parts: ['Brake sensor'], primary: [], others: [], groups: {}, primaryOptions: [{ label: 'Model A', models: ['Model A'] }] };
  const html = `<script>const DB=${JSON.stringify(fixture)};</script>`;
  const original = join(root, 'PartsFinder_Android-28 (1) (1).html');
  await put(original, html);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'README.md', 'HANDOFF.md', 'REMAINING-WORK.md', 'playwright.release.config.ts', 'apps/api/src/server.ts', 'apps/web/src/main.ts', 'apps/web/dist/index.html', 'apps/web/dist/sw.js', 'apps/web/dist/manifest.webmanifest', 'packages/domain/src/index.ts', 'scripts/example.ts', 'tests/example.ts', 'docs/operations.md', 'deploy/partavar.env.example', 'reports/real-evidence.json']) await put(join(root, file), file.endsWith('.json') ? '{}' : 'fixture\n');
  await cp(resolve('database'), join(root, 'database'), { recursive: true });
  await put(join(root, 'PartsFinder-Codex-Architecture/baseline/source-inventory.json'), '{}');
  for (const name of ['PartsFinder_Android-28_original.html', 'PartsFinder_Windows_v3_0_1.html', 'PartsFinder_Android_v3_0_1.html']) await put(join(root, 'private-data/reference-packs/PartAvar-Codex-Master-Pack/source', name), html);
  await put(join(root, 'private-data/reference-packs/PartAvar-Codex-Master-Pack.zip'), 'original source pack');
  await put(join(root, 'private-data/reference-packs/PartAvar-Codex-Master-Pack/08-OFFLINE-UPDATES-ADMIN-OPS.md'), 'source instructions');
  const imported = await importCatalogue(original, { dbPath: join(root, 'private-data/sqlite/catalogue.db'), dataRoot: join(root, 'private-data') });
  version = imported.versionId;
  await publishCatalogue(version, { dbPath: join(root, 'private-data/sqlite/catalogue.db'), dataRoot: join(root, 'private-data') });
  const db = new Database(join(root, 'private-data/sqlite/catalogue.db'));
  sourceArchive = (db.prepare('SELECT archive_path FROM catalog_versions WHERE id=?').get(version) as { archive_path: string }).archive_path;
  db.close();
  const operations = openPriceHistoryDatabase(join(root, 'private-data/sqlite/operations.db'));
  operations.close();
  writer = new Database(join(root, 'private-data/sqlite/catalogue.db'));
  writer.pragma('journal_mode=WAL');
  writer.exec('CREATE TABLE release_marker(value TEXT); INSERT INTO release_marker VALUES(\'committed in WAL\')');
  for (const file of ['.env', 'apps/api/.npmrc', 'packages/domain/.netrc', 'deploy/operator.env', 'docs/operator.env.login.json', 'deploy/credentials.pem', 'node_modules/ignored.js', 'apps/web/node_modules/ignored.js', 'private-data/backups/old/catalogue.db', 'deliverables/old.zip', 'test-results/temporary.txt', 'reports/old-release.zip', 'reports/temp/fixture.db', '.DS_Store']) await put(join(root, file), 'must not ship');
});

afterAll(async () => { writer?.close(); if (temporary) await rm(temporary, { recursive: true, force: true }); });

describe('verified release archives', () => {
  it('ships committed WAL data, authoritative sources and evidence without secrets or old bundles', async () => {
    const result = await packageRelease({ root, outputPath: archive, epoch: 1_793_145_600 });
    expect(result.verification).toMatchObject({ fileHashesVerified: true, activeVersionId: version, sourceRowsVerified: 1, snapshotChunksVerified: 12, snapshotRowsVerified: 1, databaseCount: 2 });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    const extracted = join(temporary, 'extracted');
    await run(python, [resolve('scripts/release/archive.py'), 'extract', archive, extracted]);
    const manifest = JSON.parse(await readFile(join(extracted, 'release-manifest.json'), 'utf8')) as { files: Array<{ path: string }> };
    const names = manifest.files.map(file => file.path);
    expect(names).toContain('private-data/reference-packs/PartAvar-Codex-Master-Pack.zip');
    expect(names).toContain('pnpm-lock.yaml');
    expect(names).toContain('playwright.release.config.ts');
    expect(names).toContain('reports/real-evidence.json');
    expect(names).toContain('deploy/partavar.env.example');
    expect(names.some(name => /node_modules|backups|deliverables|test-results|\.npmrc$|\.netrc$|\.env$|\.login\.json$|\.pem$|-wal$|-shm$|old-release\.zip|fixture\.db/.test(name))).toBe(false);
    const copy = new Database(join(extracted, 'private-data/sqlite/catalogue.db'), { readonly: true });
    expect(copy.prepare('SELECT value FROM release_marker').pluck().get()).toBe('committed in WAL');
    copy.close();
    await expect(verifyRelease({ inputPath: extracted })).resolves.toMatchObject({ sourceRowsVerified: 1, activeVersionId: version });
    await expect(stat(join(extracted, 'private-data/sqlite/catalogue.db-wal'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('produces the same archive bytes from unchanged inputs at a fixed epoch and refuses overwrite', async () => {
    const second = join(temporary, 'second.zip');
    const result = await packageRelease({ root, outputPath: second, epoch: 1_793_145_600 });
    expect(result.sha256).toBe((await verifyRelease({ inputPath: archive })).archiveSha256);
    await expect(packageRelease({ root, outputPath: archive, epoch: 1_793_145_600 })).rejects.toThrow(/already exists/i);
  });

  it('rejects a tampered extracted release and a wrong trusted archive hash', async () => {
    const extracted = join(temporary, 'tampered');
    await run(python, [resolve('scripts/release/archive.py'), 'extract', archive, extracted]);
    await put(join(extracted, 'apps/web/dist/index.html'), 'tampered');
    await expect(verifyRelease({ inputPath: extracted })).rejects.toThrow(/checksum|hash|byte count/i);
    await expect(verifyRelease({ inputPath: archive, expectedSha256: '0'.repeat(64) })).rejects.toThrow(/archive.*hash|archive.*checksum/i);
  });

  it('verifies a relocated archive while its original absolute import path is unavailable', async () => {
    const moved = join(temporary, 'source-moved-away');
    await rename(root, moved);
    try { await expect(verifyRelease({ inputPath: archive })).resolves.toMatchObject({ sourceRowsVerified: 1, snapshotRowsVerified: 1, activeVersionId: version }); }
    finally { await rename(moved, root); }
  });

  it('does not publish an archive when an active immutable snapshot chunk is corrupt', async () => {
    const db = new Database(join(root, 'private-data/sqlite/catalogue.db'), { readonly: true });
    const chunk = (db.prepare('SELECT relative_path FROM catalog_snapshot_chunks WHERE version_id=? LIMIT 1').get(version) as { relative_path: string }).relative_path;
    db.close();
    const path = join(root, 'private-data/snapshots', chunk);
    const original = await readFile(path);
    const invalid = join(temporary, 'invalid-snapshot.zip');
    await writeFile(path, 'corrupt chunk');
    try {
      await expect(packageRelease({ root, outputPath: invalid })).rejects.toThrow(/snapshot chunk.*checksum/i);
      await expect(stat(invalid)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await writeFile(path, original); }
  });

  it('does not publish an archive when immutable source verification fails', async () => {
    const bytes = await readFile(sourceArchive);
    await writeFile(sourceArchive, `${bytes.toString('utf8')}\nchanged source`);
    const invalid = join(temporary, 'invalid.zip');
    try {
      await expect(packageRelease({ root, outputPath: invalid })).rejects.toThrow(/source|hash|checksum/i);
      await expect(stat(invalid)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await writeFile(sourceArchive, bytes); }
  });
});

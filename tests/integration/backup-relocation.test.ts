import Database from 'better-sqlite3';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { backupCatalogue, verifyRestoreOnly } from '../../packages/importer/src/operations.js';
import { publishCatalogue } from '../../packages/importer/src/publication.js';

let temporary = '';
let root = '';
let originalArchivePath = '';
let relocatedArchivePath = '';
let versionId = '';

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'partavar-backup-relocation-'));
  const originalRoot = join(temporary, 'original');
  const sourcePath = join(temporary, 'source.html');
  await writeFile(sourcePath, `<script>const DB=${JSON.stringify({ rows: [{ part: 'Sensor', models: ['A'], tech: 'TECH-1', log: 'LOG-1', price: 1234, replacement: '', friendly: ['label'], aliases: ['alias'] }], parts: ['Sensor'], primary: [], others: [], groups: {}, primaryOptions: [{ label: 'A', models: ['A'] }] })};</script>`);
  const imported = await importCatalogue(sourcePath, { dbPath: join(originalRoot, 'sqlite/catalogue.db'), dataRoot: originalRoot });
  versionId = imported.versionId;
  await publishCatalogue(versionId, { dbPath: join(originalRoot, 'sqlite/catalogue.db'), dataRoot: originalRoot });
  const db = new Database(join(originalRoot, 'sqlite/catalogue.db'));
  originalArchivePath = (db.prepare('SELECT archive_path FROM catalog_versions WHERE id=?').get(versionId) as { archive_path: string }).archive_path;
  db.close();
  root = join(temporary, 'relocated');
  await rename(originalRoot, root);
  relocatedArchivePath = originalArchivePath.replace(originalRoot, root);
});

afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

describe('catalogue backup after relocation', () => {
  it('backs up and restore-verifies a relocated data root while preserving original source metadata', async () => {
    const destination = join(temporary, 'backup');
    await expect(backupCatalogue(destination, join(root, 'sqlite/catalogue.db'), root)).resolves.toMatchObject({ activeVersionId: versionId, integrityCheck: 'ok' });
    await expect(verifyRestoreOnly(destination)).resolves.toMatchObject({ activeVersionId: versionId, restoredRows: 1, queryable: true, backupManifestVerified: true });
    const manifest = JSON.parse(await readFile(join(destination, 'backup-manifest.json'), 'utf8')) as { artifacts: Array<{ role: string; sourcePath: string }> };
    expect(manifest.artifacts.find(item => item.role === 'source-archive')?.sourcePath).toBe(originalArchivePath);
    const backup = new Database(join(destination, 'catalogue.db'), { readonly: true });
    expect(backup.prepare('SELECT archive_path FROM catalog_versions WHERE id=?').pluck().get(versionId)).toBe(originalArchivePath);
    backup.close();
  });

  it('rejects a modified relocated source when no source with the recorded SHA remains', async () => {
    const bytes = await readFile(relocatedArchivePath);
    await writeFile(relocatedArchivePath, 'tampered source');
    try { await expect(backupCatalogue(join(temporary, 'invalid-backup'), join(root, 'sqlite/catalogue.db'), root)).rejects.toThrow(/source.*(?:hash|checksum|unavailable)/i); }
    finally { await writeFile(relocatedArchivePath, bytes); }
  });

  it('rejects an existing but modified original even when a matching relocated copy exists', async () => {
    await mkdir(dirname(originalArchivePath), { recursive: true });
    await writeFile(originalArchivePath, 'modified original');
    try { await expect(backupCatalogue(join(temporary, 'invalid-original'), join(root, 'sqlite/catalogue.db'), root)).rejects.toThrow(/source archive checksum/i); }
    finally { await rm(join(temporary, 'original'), { recursive: true, force: true }); }
  });
});

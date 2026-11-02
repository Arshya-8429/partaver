import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { backupCatalogue, verifyRestoreOnly } from '../../packages/importer/src/operations.js';
import { publishCatalogue } from '../../packages/importer/src/publication.js';

let root = '';
let backupPath = '';
let version = '';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'partsfinder-backup-'));
  const sourcePath = join(root, 'source.html');
  const fixture = {
    rows: [{ part: 'Brake sensor', models: ['Model A'], tech: 'TECH-01', log: 'LOG-01', price: 1001, replacement: '', friendly: ['ABS'], aliases: ['brake switch'] }],
    parts: ['Brake sensor'], primary: [], others: [], groups: {}, primaryOptions: [{ label: 'Model A', models: ['Model A'] }],
  };
  await writeFile(sourcePath, `<script>const DB=${JSON.stringify(fixture)};</script>`);
  const imported = await importCatalogue(sourcePath, { dbPath: join(root, 'catalogue.db'), dataRoot: root });
  version = imported.versionId;
  await publishCatalogue(version, { dbPath: join(root, 'catalogue.db'), dataRoot: root });
  backupPath = join(root, 'backups', 'verified-copy');
  await backupCatalogue(backupPath, join(root, 'catalogue.db'), root);
});

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe('recoverable database and snapshot backups', () => {
  it('does not include transient SQLite journal sidecars in the backup directory', async () => {
    const names = await readdir(backupPath);
    expect(names.filter((name) => name.endsWith('-wal') || name.endsWith('-shm'))).toEqual([]);
  });

  it('backs up the database, published snapshot, and immutable source archive with checksums', async () => {
    const manifest = JSON.parse(await readFile(join(backupPath, 'backup-manifest.json'), 'utf8')) as { activeVersionId: string; artifacts: Array<{ role: string; path: string; sha256: string }> };
    expect(manifest.activeVersionId).toBe(version);
    expect(manifest.artifacts.some((artifact) => artifact.role === 'source-archive')).toBe(true);
    expect(manifest.artifacts.some((artifact) => artifact.role === 'snapshot' && artifact.path.endsWith('manifest.json'))).toBe(true);
    expect(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
    await expect(verifyRestoreOnly(backupPath)).resolves.toMatchObject({
      restoredRows: 1, activeVersionId: version, integrityCheck: 'ok', foreignKeyViolations: 0, queryable: true, backupManifestVerified: true,
    });
    const namesAfterVerification = await readdir(backupPath);
    expect(namesAfterVerification.filter((name) => name.endsWith('-wal') || name.endsWith('-shm'))).toEqual([]);
  });

  it('refuses a backup whose artifact checksum no longer matches', async () => {
    const manifest = JSON.parse(await readFile(join(backupPath, 'backup-manifest.json'), 'utf8')) as { artifacts: Array<{ path: string }> };
    const chunk = manifest.artifacts.find((artifact) => artifact.path.endsWith('.ndjson'));
    expect(chunk).toBeDefined();
    await writeFile(join(backupPath, chunk!.path), 'corrupt');
    await expect(verifyRestoreOnly(backupPath)).rejects.toThrow(/artifact checksum or byte count mismatch/i);
  });
});

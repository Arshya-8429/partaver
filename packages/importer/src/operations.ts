import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { defaultDataRoot, defaultDatabasePath, openCatalogueDatabase } from './database.js';

export interface BackupReport {
  outputPath: string;
  manifestPath: string;
  bytes: number;
  sha256: string;
  integrityCheck: string;
  activeVersionId: string | null;
  artifactCount: number;
}

export interface RestoreVerificationReport {
  inputPath: string;
  restoredRows: number;
  activeVersionId: string | null;
  integrityCheck: string;
  foreignKeyViolations: number;
  queryable: boolean;
  restoreDestination: string;
  backupManifestVerified: boolean;
}

interface BackupArtifact {
  role: 'snapshot' | 'source-archive';
  path: string;
  sourcePath: string;
  bytes: number;
  sha256: string;
}

interface BackupManifest {
  format: 'partsfinder-backup-v1';
  createdAt: string;
  activeVersionId: string | null;
  database: { path: string; bytes: number; sha256: string };
  artifacts: BackupArtifact[];
}

function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function integrityCheck(db: Database.Database): string {
  const row = db.prepare('PRAGMA integrity_check').get() as Record<string, string>;
  return Object.values(row)[0] ?? 'unknown';
}

function containedPath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const rel = relative(resolve(root), absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Backup artifact path escapes its data root: ${path}`);
  return absolute;
}

async function copyArtifact(sourcePath: string, targetPath: string, role: BackupArtifact['role'], sourceLabel: string): Promise<BackupArtifact> {
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Backup artifact is not a regular file: ${sourcePath}`);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  const copied = await readFile(targetPath);
  return { role, path: '', sourcePath: sourceLabel, bytes: copied.byteLength, sha256: hashFile(copied) };
}

async function resolveSourceArchive(originalPath: string, expectedSha256: string, dataRoot: string): Promise<string> {
  const original = isAbsolute(originalPath) ? resolve(originalPath) : containedPath(dataRoot, originalPath);
  try {
    const info = await lstat(original);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Source archive is not a regular file: ${originalPath}`);
    if (hashFile(await readFile(original)) !== expectedSha256) throw new Error(`Source archive checksum differs from the catalogue record: ${originalPath}`);
    return original;
  } catch (error) {
    // A changed existing source is an integrity failure. Relocation fallback is
    // only for a path that is genuinely unavailable on the destination host.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const directory = containedPath(dataRoot, 'source-archive');
  async function find(directoryPath: string): Promise<string | undefined> {
    let info;
    try { info = await lstat(directoryPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Relocated source archive directory must be a regular directory');
    for (const name of (await readdir(directoryPath)).sort()) {
      const path = join(directoryPath, name);
      const entry = await lstat(path);
      if (entry.isSymbolicLink()) throw new Error('Relocated source archive contains a symbolic link');
      if (entry.isDirectory()) {
        const nested = await find(path);
        if (nested) return nested;
      } else if (entry.isFile() && hashFile(await readFile(path)) === expectedSha256) return path;
    }
    return undefined;
  }
  const relocated = await find(directory);
  if (!relocated) throw new Error(`Source archive unavailable or checksum mismatch in configured data root: ${originalPath}`);
  return relocated;
}

export async function backupCatalogue(outputPath: string, dbPath = defaultDatabasePath(), dataRoot = defaultDataRoot()): Promise<BackupReport> {
  const destination = resolve(outputPath);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  try { await stat(destination); throw new Error(`Backup destination already exists: ${destination}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const staging = await mkdtemp(join(parent, `${basename(destination)}.staging-`));
  const backupDatabasePath = join(staging, 'catalogue.db');
  let activeVersionId: string | null = null;
  try {
    const db = openCatalogueDatabase(dbPath);
    try {
      await db.backup(backupDatabasePath);
    } finally { db.close(); }

    const backup = new Database(backupDatabasePath, { readonly: true, fileMustExist: true });
    const artifactsToCopy: Array<{ role: BackupArtifact['role']; sourcePath: string; sourceLabel: string; targetPath: string }> = [];
    let check: string;
    try {
      activeVersionId = (backup.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null }).active_version_id;
      check = integrityCheck(backup);
      if (check !== 'ok') throw new Error(`Backup integrity check failed: ${check}`);
      const snapshots = backup.prepare('SELECT relative_path FROM catalog_snapshots ORDER BY version_id').all() as Array<{ relative_path: string }>;
      const chunks = backup.prepare('SELECT relative_path FROM catalog_snapshot_chunks ORDER BY version_id, table_name, ordinal').all() as Array<{ relative_path: string }>;
      const snapshotPaths = new Set([...snapshots, ...chunks].map((item) => item.relative_path));
      for (const sourceRelativePath of snapshotPaths) {
        const dataRelativePath = sourceRelativePath.startsWith(`snapshots${sep}`) ? sourceRelativePath : join('snapshots', sourceRelativePath);
        const source = containedPath(dataRoot, dataRelativePath);
        artifactsToCopy.push({ role: 'snapshot', sourcePath: source, sourceLabel: dataRelativePath, targetPath: containedPath(staging, `artifacts/${dataRelativePath}`) });
      }
      const archives = backup.prepare('SELECT DISTINCT archive_path, source_sha256 FROM catalog_versions WHERE archive_path IS NOT NULL ORDER BY archive_path').all() as Array<{ archive_path: string; source_sha256: string }>;
      for (const archive of archives) {
        const archivePath = await resolveSourceArchive(archive.archive_path, archive.source_sha256, dataRoot);
        artifactsToCopy.push({ role: 'source-archive', sourcePath: archivePath, sourceLabel: archive.archive_path, targetPath: containedPath(staging, `artifacts/source-archive/${archive.source_sha256}-${basename(archive.archive_path)}`) });
      }
    } finally { backup.close(); }

    // Opening the fresh backup read-only for inspection can leave empty WAL/SHM
    // sidecars behind. They are transient SQLite state, not part of the backup.
    await Promise.all([
      rm(`${backupDatabasePath}-wal`, { force: true }),
      rm(`${backupDatabasePath}-shm`, { force: true }),
    ]);
    const databaseBytes = await readFile(backupDatabasePath);
    const databaseStat = await stat(backupDatabasePath);
    const artifacts: BackupArtifact[] = [];
    for (const item of artifactsToCopy) {
      const copy = await copyArtifact(item.sourcePath, item.targetPath, item.role, item.sourceLabel);
      copy.path = relative(staging, item.targetPath).split(sep).join('/');
      artifacts.push(copy);
    }
    const manifest: BackupManifest = {
      format: 'partsfinder-backup-v1',
      createdAt: new Date().toISOString(),
      activeVersionId,
      database: { path: 'catalogue.db', bytes: databaseStat.size, sha256: hashFile(databaseBytes) },
      artifacts,
    };
    await writeFile(join(staging, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    const allBytes = databaseStat.size + artifacts.reduce((sum, item) => sum + item.bytes, 0) + (await stat(join(staging, 'backup-manifest.json'))).size;
    await rename(staging, destination);
    return { outputPath: destination, manifestPath: join(destination, 'backup-manifest.json'), bytes: allBytes, sha256: manifest.database.sha256, integrityCheck: check, activeVersionId, artifactCount: artifacts.length };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function verifyRestoreOnly(inputPath: string): Promise<RestoreVerificationReport> {
  const input = resolve(inputPath);
  let sourcePath = input;
  let backupManifestVerified = false;
  if ((await stat(input)).isDirectory()) {
    const manifestPath = join(input, 'backup-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifest;
    if (manifest.format !== 'partsfinder-backup-v1' || manifest.database.path !== 'catalogue.db' || !Array.isArray(manifest.artifacts)) throw new Error('Backup manifest is malformed or unsupported.');
    sourcePath = join(input, manifest.database.path);
    const databaseBytes = await readFile(sourcePath);
    if (databaseBytes.byteLength !== manifest.database.bytes || hashFile(databaseBytes) !== manifest.database.sha256) throw new Error('Backup database checksum or byte count does not match its manifest.');
    for (const artifact of manifest.artifacts) {
      const artifactPath = containedPath(input, artifact.path);
      const bytes = await readFile(artifactPath);
      if (bytes.byteLength !== artifact.bytes || hashFile(bytes) !== artifact.sha256) throw new Error(`Backup artifact checksum or byte count mismatch: ${artifact.path}`);
    }
    backupManifestVerified = true;
  }
  const directory = await mkdtemp(join(tmpdir(), 'partsfinder-restore-'));
  const temporaryRestorePath = resolve(directory, 'restore.db');
  const sourceSidecars = [`${sourcePath}-wal`, `${sourcePath}-shm`];
  const sidecarsInitiallyPresent = await Promise.all(sourceSidecars.map(async (sidecar) => {
    try { await stat(sidecar); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }));
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const hasCatalogueTable = source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_versions'").get();
    if (!hasCatalogueTable) throw new Error('Backup does not contain a PartsFinder catalogue database');
    await source.backup(temporaryRestorePath);
  } finally {
    source.close();
    await Promise.all(sourceSidecars.map((sidecar, index) => sidecarsInitiallyPresent[index] ? Promise.resolve() : rm(sidecar, { force: true })));
  }

  try {
    const restored = new Database(temporaryRestorePath, { readonly: true, fileMustExist: true });
    try {
      restored.pragma('foreign_keys = ON');
      const check = integrityCheck(restored);
      const foreignKeyViolations = restored.prepare('PRAGMA foreign_key_check').all().length;
      const activeVersionId = (restored.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null } | undefined)?.active_version_id ?? null;
      const restoredRows = activeVersionId
        ? Number((restored.prepare('SELECT COUNT(*) AS count FROM catalog_entries WHERE version_id=?').get(activeVersionId) as { count: number }).count)
        : Number((restored.prepare('SELECT COUNT(*) AS count FROM catalog_entries').get() as { count: number }).count);
      const queryable = activeVersionId
        ? Boolean(restored.prepare('SELECT id FROM catalog_entries WHERE version_id=? ORDER BY source_row_ordinal LIMIT 1').get(activeVersionId))
        : Boolean(restored.prepare('SELECT id FROM catalog_entries ORDER BY id LIMIT 1').get());
      if (check !== 'ok' || foreignKeyViolations !== 0) throw new Error(`Restored backup failed integrity checks: integrity=${check}, foreignKeys=${foreignKeyViolations}`);
      return {
        inputPath: sourcePath,
        restoredRows,
        activeVersionId,
        integrityCheck: check,
        foreignKeyViolations,
        queryable,
        restoreDestination: 'isolated temporary database (removed after verification)',
        backupManifestVerified,
      };
    } finally {
      restored.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { SnapshotManifest } from '@partsfinder/contracts';

export class SnapshotAccessError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
  }
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function getSnapshotManifest(db: Database.Database, version: string, dataRoot: string): Promise<{ manifest: SnapshotManifest; sha256: string }> {
  if (!/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(version)) throw new SnapshotAccessError('SNAPSHOT_NOT_FOUND', 404, 'Offline snapshot was not found.');
  const row = db.prepare('SELECT manifest_sha256 FROM catalog_snapshots WHERE version_id=?').get(version) as { manifest_sha256: string } | undefined;
  if (!row) throw new SnapshotAccessError('SNAPSHOT_NOT_FOUND', 404, 'Offline snapshot was not found.');
  const path = resolve(dataRoot, 'snapshots', version, 'manifest.json');
  let bytes: Buffer;
  try { bytes = await readFile(path); } catch { throw new SnapshotAccessError('SNAPSHOT_NOT_FOUND', 404, 'Offline snapshot was not found.'); }
  if (digest(bytes) !== row.manifest_sha256) throw new SnapshotAccessError('SNAPSHOT_CORRUPT', 500, 'Offline snapshot manifest failed verification.');
  const manifest = JSON.parse(bytes.toString('utf8')) as SnapshotManifest;
  if (manifest.catalogVersion !== version) throw new SnapshotAccessError('SNAPSHOT_CORRUPT', 500, 'Offline snapshot version does not match its route.');
  return { manifest, sha256: row.manifest_sha256 };
}

export async function getSnapshotChunk(db: Database.Database, version: string, chunkId: string, dataRoot: string): Promise<{ bytes: Buffer; sha256: string }> {
  if (!/^[a-zA-Z0-9-]{1,96}$/.test(chunkId)) throw new SnapshotAccessError('SNAPSHOT_CHUNK_NOT_FOUND', 404, 'Snapshot chunk was not found.');
  const row = db.prepare('SELECT relative_path, sha256, decoded_bytes FROM catalog_snapshot_chunks WHERE version_id=? AND chunk_id=?').get(version, chunkId) as {
    relative_path: string; sha256: string; decoded_bytes: number;
  } | undefined;
  if (!row) throw new SnapshotAccessError('SNAPSHOT_CHUNK_NOT_FOUND', 404, 'Snapshot chunk was not found.');
  const root = resolve(dataRoot, 'snapshots');
  const path = resolve(root, row.relative_path);
  const pathFromRoot = relative(root, path);
  if (pathFromRoot.startsWith('..') || pathFromRoot.startsWith('/')) throw new SnapshotAccessError('SNAPSHOT_CORRUPT', 500, 'Snapshot chunk path is invalid.');
  let bytes: Buffer;
  try { bytes = await readFile(path); } catch { throw new SnapshotAccessError('SNAPSHOT_CHUNK_NOT_FOUND', 404, 'Snapshot chunk was not found.'); }
  if (bytes.byteLength !== row.decoded_bytes || digest(bytes) !== row.sha256) throw new SnapshotAccessError('SNAPSHOT_CORRUPT', 500, 'Snapshot chunk failed verification.');
  return { bytes, sha256: row.sha256 };
}

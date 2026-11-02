import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, readdir, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const RELEASE_FORMAT = 'partavar-release-v1';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REQUIRED_FILES = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'playwright.release.config.ts', 'README.md', 'HANDOFF.md', 'REMAINING-WORK.md',
  'PartsFinder_Android-28 (1) (1).html', 'apps/api/src/server.ts', 'apps/web/dist/index.html',
  'apps/web/dist/sw.js', 'apps/web/dist/manifest.webmanifest', 'database/migrations/0001_catalogue.sql',
  'database/migrations/0002_search_indexes.sql', 'database/migrations/0003_snapshots_and_publication.sql',
  'private-data/sqlite/catalogue.db', 'private-data/reference-packs/PartAvar-Codex-Master-Pack.zip',
  ...['PartsFinder_Android-28_original.html', 'PartsFinder_Windows_v3_0_1.html', 'PartsFinder_Android_v3_0_1.html'].map(name => `private-data/reference-packs/PartAvar-Codex-Master-Pack/source/${name}`),
] as const;

export interface ReleaseFile { path: string; bytes: number; sha256: string }
export interface ReleaseSource { versionId: string; originalPath: string; path: string; sha256: string; status: string }
export interface ReleaseManifest {
  format: typeof RELEASE_FORMAT;
  version: string;
  epoch: number;
  createdAt: string;
  activeVersionId: string;
  databases: string[];
  sources: ReleaseSource[];
  files: ReleaseFile[];
  fileCount: number;
  totalFileBytes: number;
  packagingPolicy: string;
}

export function containedPath(root: string, name: string): string {
  if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || isAbsolute(name) || /^[A-Za-z]:/.test(name)) throw new Error(`Unsafe release path: ${name}`);
  const path = resolve(root, name);
  const rel = relative(resolve(root), path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Release path leaves its root: ${name}`);
  return path;
}

export async function digestFile(path: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const value of createReadStream(path)) {
    const buffer = value as Buffer;
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest('hex') };
}

export async function regularFiles(root: string, prefix = '', ignoredDirectories = new Set<string>()): Promise<string[]> {
  const files: string[] = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    if (ignoredDirectories.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(containedPath(root, path));
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in releases: ${path}`);
    if (info.isDirectory()) files.push(...await regularFiles(root, path, ignoredDirectories));
    else if (info.isFile()) files.push(path);
    else throw new Error(`Non-regular release file: ${path}`);
  }
  return files;
}

export async function assertAbsent(path: string): Promise<void> {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Output already exists: ${path}`);
}

export async function assertRequiredFiles(root: string): Promise<void> {
  for (const name of REQUIRED_FILES) {
    const info = await stat(containedPath(root, name));
    if (!info.isFile()) throw new Error(`Required release file is unavailable: ${name}`);
  }
}

export function pythonExecutable(): string {
  if (process.env.PARTAVAR_PYTHON) return process.env.PARTAVAR_PYTHON;
  const bundled = resolve(dirname(process.execPath), '../../python/bin/python3');
  return existsSync(bundled) ? bundled : 'python3';
}

const run = promisify(execFile);
export async function archiveCommand(action: 'create' | 'extract', input: string, output: string, epoch?: number): Promise<void> {
  const helper = fileURLToPath(new URL('./archive.py', import.meta.url));
  await run(pythonExecutable(), [helper, action, input, output, ...(epoch === undefined ? [] : [String(epoch)])], { maxBuffer: 1024 * 1024 });
}

export async function writeReport(path: string | undefined, value: unknown): Promise<void> {
  if (path) await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

export function isMain(url: string): boolean {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url));
}

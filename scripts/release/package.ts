import Database from 'better-sqlite3';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveCommand, assertAbsent, assertRequiredFiles, containedPath, digestFile, isMain, regularFiles, RELEASE_FORMAT, ROOT, writeReport, type ReleaseManifest, type ReleaseSource } from './common.js';
import { verifyRelease, type ReleaseVerification } from './verify.js';

const DIRECTORIES = ['apps', 'packages', 'scripts', 'tests', 'database', 'docs', 'deploy', 'reports', 'PartsFinder-Codex-Architecture', 'private-data/source-archive', 'private-data/snapshots', 'private-data/imports', 'private-data/reference-packs', 'private-data/sqlite'];
const ROOT_FILES = ['.gitignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'eslint.config.js', 'vitest.config.ts', 'playwright.config.ts', 'README.md', 'HANDOFF.md', 'REMAINING-WORK.md', 'PartsFinder_Android-28 (1) (1).html'];
const EXCLUDED_NAMES = new Set(['node_modules', '.git', '.superpowers', '.DS_Store', '.npmrc', '.netrc', '.pypirc', '.yarnrc', '.yarnrc.yml', 'test-results', 'playwright-report', 'coverage', 'backups', 'deliverables', 'test-temp', 'tmp', 'temp']);

function excluded(name: string): boolean {
  const parts = name.split('/');
  const file = parts.at(-1) ?? '';
  return parts.some(part => EXCLUDED_NAMES.has(part) || part.startsWith('.staging-')) ||
    /(?:-wal|-shm|-journal|\.tmp|\.tsbuildinfo)$/i.test(file) ||
    (/(?:^|\.)env(?:\.|$)/i.test(file) && !file.endsWith('.example')) || /\.login\.json$/i.test(file) ||
    /\.(?:pem|key|p12|pfx|db|sqlite|sqlite3)$/i.test(file) || /^(?:operator-login|credentials|secrets?)(?:\.|$)/i.test(file) ||
    (name.startsWith('reports/') && (/\.(?:zip|tar|tgz|tar\.gz)(?:\.sha256)?$/i.test(file) || /^(?:release-package|release-verification|release-manifest).*\.json$/i.test(file)));
}

async function copyTree(sourceRoot: string, targetRoot: string, name: string): Promise<void> {
  if (excluded(name)) return;
  const from = containedPath(sourceRoot, name);
  let info;
  try { info = await lstat(from); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in release input: ${name}`);
  const to = containedPath(targetRoot, name);
  if (info.isDirectory()) {
    for (const child of (await readdir(from)).sort()) await copyTree(sourceRoot, targetRoot, `${name}/${child}`);
  } else if (info.isFile()) {
    if (name.startsWith('reports/') && name.endsWith('.json')) {
      try {
        const report = JSON.parse(await readFile(from, 'utf8')) as { format?: string };
        if (report && (report.format === 'partavar-release-package-report-v1' || report.format === 'partavar-release-verification-v1')) return;
      } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  } else throw new Error(`Non-regular release input: ${name}`);
}

async function backupDatabase(source: string, target: string): Promise<void> {
  if (!(await lstat(source)).isFile()) throw new Error('Database input must be a regular file');
  await mkdir(dirname(target), { recursive: true });
  const live = new Database(source, { readonly: true, fileMustExist: true });
  try { await live.backup(target); }
  finally { live.close(); }
  // Only the disposable backup is checkpointed/converted. The live DB and its
  // WAL remain under SQLite's control, including while a reader is running.
  const copy = new Database(target, { fileMustExist: true });
  try {
    copy.pragma('wal_checkpoint(TRUNCATE)');
    copy.pragma('journal_mode=DELETE');
    const check = copy.pragma('integrity_check', { simple: true });
    if (check !== 'ok' || (copy.pragma('foreign_key_check') as unknown[]).length) throw new Error(`Release database backup failed integrity verification: ${source}`);
  } finally { copy.close(); }
  await Promise.all(['-wal', '-shm', '-journal'].map(suffix => rm(`${target}${suffix}`, { force: true })));
}

async function sourceMappings(sourceRoot: string, stagedRoot: string): Promise<{ activeVersionId: string; sources: ReleaseSource[] }> {
  const db = new Database(join(stagedRoot, 'private-data/sqlite/catalogue.db'), { readonly: true, fileMustExist: true });
  try {
    const activeVersionId = (db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get() as { active_version_id: string | null } | undefined)?.active_version_id;
    if (!activeVersionId) throw new Error('Release catalogue has no active published version');
    const versions = db.prepare('SELECT id, archive_path, source_sha256, status FROM catalog_versions ORDER BY id').all() as Array<{ id: string; archive_path: string; source_sha256: string; status: string }>;
    const sources: ReleaseSource[] = [];
    for (const version of versions) {
      if (!['validated', 'published'].includes(version.status)) throw new Error(`Unvalidated catalogue version cannot ship: ${version.id}`);
      const original = isAbsolute(version.archive_path) ? version.archive_path : resolve(sourceRoot, 'private-data', version.archive_path);
      const rel = relative(sourceRoot, original).split(sep).join('/');
      let path: string | undefined;
      if (rel && !rel.startsWith('../') && !isAbsolute(rel) && !excluded(rel)) {
        try { if ((await digestFile(containedPath(stagedRoot, rel))).sha256 === version.source_sha256) path = rel; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      if (!path) {
        await mkdir(join(stagedRoot, 'private-data/source-archive'), { recursive: true });
        for (const candidate of await regularFiles(join(stagedRoot, 'private-data/source-archive'))) {
          const archivedPath = `private-data/source-archive/${candidate}`;
          if ((await digestFile(containedPath(stagedRoot, archivedPath))).sha256 === version.source_sha256) { path = archivedPath; break; }
        }
      }
      if (!path) {
        path = `private-data/source-archive/${version.source_sha256}-${basename(original)}`;
        if ((await digestFile(original)).sha256 !== version.source_sha256) throw new Error(`Original source hash no longer matches catalogue: ${version.id}`);
        await mkdir(dirname(containedPath(stagedRoot, path)), { recursive: true });
        await copyFile(original, containedPath(stagedRoot, path));
      }
      sources.push({ versionId: version.id, originalPath: version.archive_path, path, sha256: version.source_sha256, status: version.status });
    }
    return { activeVersionId, sources };
  } finally { db.close(); }
}

export interface PackageOptions { root?: string; outputPath: string; epoch?: number; version?: string; reportPath?: string }
export interface PackageReport { format: 'partavar-release-package-report-v1'; outputPath: string; sha256: string; bytes: number; fileCount: number; verification: ReleaseVerification }

export async function packageRelease(options: PackageOptions): Promise<PackageReport> {
  const root = resolve(options.root ?? ROOT);
  const output = resolve(options.outputPath);
  if (!output.endsWith('.zip')) throw new Error('Release output must have a .zip extension');
  const epoch = options.epoch ?? Number(process.env.SOURCE_DATE_EPOCH ?? 0);
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 4354819198) throw new Error('Release epoch must be a non-negative Unix timestamp no later than 2107');
  await assertAbsent(output);
  await assertAbsent(`${output}.sha256`);
  if (options.reportPath) await assertAbsent(resolve(options.reportPath));
  await assertRequiredFiles(root);
  await mkdir(dirname(output), { recursive: true });
  const temporary = await mkdtemp(join(dirname(output), '.staging-partavar-release-'));
  const staged = join(temporary, 'release');
  try {
    await mkdir(staged);
    const configurations = (await readdir(root)).filter(name => /^(?:playwright.*|vite|vitest)\.config\.ts$/.test(name));
    for (const name of new Set([...ROOT_FILES, ...configurations, ...DIRECTORIES])) await copyTree(root, staged, name);
    const databases: string[] = [];
    for (const name of (await readdir(join(root, 'private-data/sqlite'))).filter(name => name.endsWith('.db')).sort()) {
      const path = `private-data/sqlite/${name}`;
      await backupDatabase(containedPath(root, path), containedPath(staged, path));
      databases.push(path);
    }
    const catalogue = await sourceMappings(root, staged);
    const files = [];
    for (const path of await regularFiles(staged)) files.push({ path, ...await digestFile(containedPath(staged, path)) });
    const manifest: ReleaseManifest = {
      format: RELEASE_FORMAT, version: options.version ?? '1.0.0', epoch, createdAt: new Date(epoch * 1000).toISOString(),
      ...catalogue, databases, files, fileCount: files.length, totalFileBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      packagingPolicy: 'Source/build/docs/evidence and authoritative private data; SQLite online backups; excludes dependencies, secrets, transient/test files, historical deliverables, backups and generated release reports. Original archive metadata is preserved; sources[].path resolves relocated archives.',
    };
    await writeFile(join(staged, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    const candidate = join(temporary, 'candidate.zip');
    await archiveCommand('create', staged, candidate, epoch);
    const checksum = await digestFile(candidate);
    const verification = await verifyRelease({ inputPath: candidate, expectedSha256: checksum.sha256 });
    const checksumPath = join(temporary, 'candidate.sha256');
    await writeFile(checksumPath, `${checksum.sha256}  ${basename(output)}\n`, { flag: 'wx', mode: 0o600 });
    // Hard-link publication is atomic and refuses existing destinations. Unlike
    // rename(), it cannot silently overwrite a release created by another run.
    await link(checksumPath, `${output}.sha256`);
    try { await link(candidate, output); }
    catch (error) { await rm(`${output}.sha256`); throw error; }
    const report: PackageReport = { format: 'partavar-release-package-report-v1', outputPath: output, ...checksum, fileCount: files.length, verification };
    await writeReport(options.reportPath, report);
    return report;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(arg => arg !== '--'), options: { root: { type: 'string' }, output: { type: 'string' }, epoch: { type: 'string' }, version: { type: 'string' }, report: { type: 'string' } } });
  if (!values.output) throw new Error('Usage: pnpm release:package --output NEW.zip [--root ROOT] [--epoch UNIX_SECONDS] [--version VERSION] [--report NEW.json]');
  packageRelease({ outputPath: values.output, ...(values.root ? { root: values.root } : {}), ...(values.epoch ? { epoch: Number(values.epoch) } : {}), ...(values.version ? { version: values.version } : {}), ...(values.report ? { reportPath: values.report } : {}) })
    .then(report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}

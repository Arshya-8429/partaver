import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const dist = resolve(workspaceRoot, 'apps/web/dist');
const sourcePath = resolve(workspaceRoot, 'PartsFinder_Android-28 (1) (1).html');
const sourceSha = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
const expectedSourceSha = '5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480';
if (sourceSha !== expectedSourceSha) throw new Error(`Original HTML changed: ${sourceSha}`);

async function filesUnder(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) output.push(...await filesUnder(path));
    else output.push(path);
  }
  return output;
}

const files = await filesUnder(dist);
const assetRows = [] as Array<{ path: string; bytes: number; gzipBytes: number }>;
const forbidden = [/better-sqlite3/i, /private-data/i, /source-archive/i, /catalogue\.db/i, /\.sqlite(?:3)?$/i, /PartsFinder_Android-28/i, /migration-report\.json/i];
for (const path of files) {
  const relativePath = relative(dist, path).split(sep).join('/');
  if (forbidden.some((pattern) => pattern.test(relativePath))) throw new Error(`Private or server-only asset is in web output: ${relativePath}`);
  const file = await readFile(path);
  const content = file.toString('utf8');
  if (content.includes('const DB=') || content.includes('"rows":[{"part":')) throw new Error(`A legacy catalogue literal was found in ${relativePath}`);
  if (relativePath.endsWith('.js') || relativePath.endsWith('.css') || relativePath.endsWith('.html')) {
    assetRows.push({ path: relativePath, bytes: file.byteLength, gzipBytes: gzipSync(file, { level: 9 }).byteLength });
  }
  if (relativePath.endsWith('.js') && file.byteLength > 2 * 1024 * 1024) throw new Error(`Oversized JavaScript module in bundle: ${relativePath}`);
}
const initial = assetRows.filter((row) => row.path.endsWith('.html') || row.path.endsWith('.css') || /assets\/index-.*\.js$/.test(row.path));
const initialGzipBytes = initial.reduce((sum, row) => sum + row.gzipBytes, 0);
// Include every emitted JS/CSS/HTML module as a conservative bound. The static
// index subtotal alone misses dynamic app/site bootstraps and Worker modules.
const emittedCodeGzipBytes = assetRows.reduce((sum, row) => sum + row.gzipBytes, 0);
if (emittedCodeGzipBytes > 250 * 1024) throw new Error(`All emitted HTML/CSS/JS is ${emittedCodeGzipBytes} compressed bytes; target is 256000.`);
const serviceWorker = (await readFile(resolve(dist, 'sw.js'), 'utf8'));
if (serviceWorker.includes('__PRECACHE_ASSETS__')) throw new Error('Service worker precache list was not injected.');
if (!serviceWorker.includes("url.pathname.startsWith('/api/')")) throw new Error('Service worker does not exclude API routes from caching.');
const precacheMatch = serviceWorker.match(/const PRECACHE_ASSETS = (\[[^\n]*\]);/);
if (!precacheMatch?.[1]) throw new Error('Service worker precache list is not a literal path list.');
const precachePaths = JSON.parse(precacheMatch[1]) as string[];
if (precachePaths.some((path) => path.includes('/api/') || path.includes('snapshot/chunks'))) throw new Error('Service worker precache list contains catalogue data or API routes.');

const report = {
  generatedAt: new Date().toISOString(),
  sourceSha256: sourceSha,
  originalSourceUnchanged: true,
  outputDirectory: dist,
  files: assetRows,
  entrypointSubtotalFiles: initial,
  entrypointSubtotalGzipBytes: initialGzipBytes,
  emittedCodeGzipBytes,
  sizeGate: 'All emitted JS/CSS/HTML modules including optional chunks and Workers; conservative upper bound, not a measured network startup.',
  appJsBytes: assetRows.filter((row) => row.path.endsWith('.js')).reduce((sum, row) => sum + row.bytes, 0),
  appJsGzipBytes: assetRows.filter((row) => row.path.endsWith('.js')).reduce((sum, row) => sum + row.gzipBytes, 0),
  legacyLiteralFound: false,
  privateFilesFound: false,
  catalogueInServiceWorkerCache: false,
  result: 'passed',
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

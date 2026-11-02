import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const dist = resolve(workspaceRoot, 'apps/web/dist');
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8')) as Record<string, {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
  src?: string;
}>;
const paths = new Set<string>(['/']);
const visited = new Set<string>();
function visit(key: string): void {
  if (visited.has(key)) return;
  visited.add(key);
  const item = manifest[key];
  if (!item) throw new Error(`Build manifest import was missing: ${key}`);
  paths.add(`/${item.file}`);
  for (const file of [...(item.css ?? []), ...(item.assets ?? [])]) paths.add(`/${file}`);
  for (const imported of [...(item.imports ?? []), ...(item.dynamicImports ?? [])]) visit(imported);
}
const entry = Object.entries(manifest).find(([key, item]) => key === 'index.html' || item.file.endsWith('.html') || item.src === 'index.html')?.[0];
if (!entry) throw new Error('Vite did not emit an HTML entry in its build manifest.');
visit(entry);
const serviceWorkerPath = resolve(dist, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes('__PRECACHE_ASSETS__')) throw new Error('The service worker asset placeholder was not found.');
const assets = [...paths].filter((path) => path !== '/').sort();
const revision = createHash('sha256').update(await readFile(resolve(dist, 'index.html'))).update(assets.join('\n')).digest('hex').slice(0, 16);
await writeFile(serviceWorkerPath, serviceWorker.replace('__PRECACHE_ASSETS__', JSON.stringify(assets)).replace('__SHELL_REVISION__', revision), 'utf8');
process.stdout.write(`${JSON.stringify({ serviceWorker: serviceWorkerPath, precachedAssets: assets.length, paths: assets }, null, 2)}\n`);

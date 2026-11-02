import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { registerPriceHistoryRoutes } from '../../apps/api/src/price-history/routes.js';

const cataloguePath = 'private-data/sqlite/catalogue.db';
const operationsPath = 'private-data/sqlite/operations.db';
const catalogue = new Database(cataloguePath, { readonly: true, fileMustExist: true });
const version = (catalogue.prepare('SELECT active_version_id AS id FROM catalog_state WHERE singleton=1').get() as { id: string }).id;
const ids = (catalogue.prepare('SELECT id FROM catalog_entries WHERE version_id=? ORDER BY id LIMIT 20').all(version) as Array<{ id: number }>).map(row => row.id);
catalogue.close();
let productionBatchCount = 0;
if (existsSync(operationsPath)) {
  const operations = new Database(operationsPath, { readonly: true, fileMustExist: true });
  if (operations.prepare("SELECT name FROM sqlite_master WHERE name='ph_batches'").get()) productionBatchCount = (operations.prepare('SELECT count(*) AS n FROM ph_batches').get() as { n: number }).n;
  operations.close();
}
const app = Fastify();
registerPriceHistoryRoutes(app, { cataloguePath, operationsPath });
await app.ready();
const timings: number[] = [];
let responseBytes = 0;
for (let i = 0; i <= 200; i++) {
  const start = performance.now();
  const response = await app.inject(`/api/v1/price-history/summary?version=${version}&ids=${ids.join(',')}`);
  if (response.statusCode !== 200) throw new Error(`Historical summary returned ${response.statusCode}`);
  if (i > 0) timings.push(performance.now() - start);
  responseBytes = Buffer.byteLength(response.body);
}
await app.close();
timings.sort((a, b) => a - b);
const report = {
  measuredAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, architecture: process.arch }, catalogueVersion: version,
  productionBatchCount, importedProductionHistory: false, entriesPerRequest: ids.length, requests: timings.length,
  medianMs: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.ceil(timings.length * .95) - 1], maxMs: timings.at(-1), responseBytes,
  note: 'Fastify in-process inject timing on the retained real catalogue. No company history was supplied or invented. This measures the neutral-summary path, excludes network/browser latency, and does not establish populated production-history performance.',
};
await writeFile('reports/partavar/price-history-performance.json', JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

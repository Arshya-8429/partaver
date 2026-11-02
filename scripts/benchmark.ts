import os from 'node:os';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { createServer } from '../apps/api/src/server.js';
import { verifyCatalogue } from '../packages/importer/src/verify.js';

function args(values: string[]): Map<string, string> {
  const output = new Map<string, string>();
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    if (key?.startsWith('--') && values[index + 1] && !values[index + 1]?.startsWith('--')) output.set(key, values[++index] as string);
  }
  return output;
}

const parsed = args(process.argv.slice(2));
const version = parsed.get('--version');
if (!version) throw new Error('Usage: pnpm benchmark -- --version VERSION [--source PATH] [--samples COUNT]');
const samples = Math.max(3, Math.min(30, Number(parsed.get('--samples') ?? '7')));
const databasePath = resolve('private-data/sqlite/catalogue.db');
const sourcePath = parsed.get('--source');
const migration = await verifyCatalogue(version, { dbPath: databasePath, ...(sourcePath ? { sourcePath: resolve(sourcePath) } : {}) });
if (!migration.fullDatabaseHashMatch || migration.rowHashMismatches !== 0 || migration.foreignKeyViolations !== 0 || migration.integrityCheck !== 'ok') {
  throw new Error('Benchmark refused because the requested catalogue failed its source/SQLite verification.');
}
const db = new Database(databasePath, { readonly: true, fileMustExist: true });
const active = db.prepare('SELECT active_version_id AS version FROM catalog_state WHERE singleton=1').get() as { version: string | null };
if (active.version !== version) throw new Error(`Benchmark version ${version} is not the active database version.`);
const vehicle = db.prepare("SELECT id FROM vehicle_options WHERE version_id=? AND option_kind='main' ORDER BY display_order LIMIT 1").get(version) as { id: number } | undefined;
if (!vehicle) throw new Error('No main vehicle option is available for the model search benchmark.');
const cases = [
  { name: 'warm_exact_code', query: '0CF25BE-1500011BA', mode: 'global', kind: 'code' },
  { name: 'name_phrase', query: 'گیربکس اتوماتیک', mode: 'global', kind: 'name' },
  { name: 'vehicle_name', query: 'گیربکس', mode: 'vehiclePart', kind: 'name', vehicleOptionId: vehicle.id },
  { name: 'short_code_fallback_2_chars', query: 'BA', mode: 'global', kind: 'code' },
] as const;
const server = await createServer({ databasePath, logger: false });
const results: Array<Record<string, unknown>> = [];
const memoryBefore = process.memoryUsage();
const serverStarted = performance.now();
try {
  for (const testCase of cases) {
    const durations: number[] = [];
    let totalMatches = 0;
    for (let iteration = 0; iteration < samples + 2; iteration++) {
      const url = new URL('http://localhost/api/v1/search');
      url.searchParams.set('version', version);
      url.searchParams.set('mode', testCase.mode);
      url.searchParams.set('kind', testCase.kind);
      url.searchParams.set('q', testCase.query);
      url.searchParams.set('limit', '20');
      if ('vehicleOptionId' in testCase) url.searchParams.set('vehicleOptionId', String(testCase.vehicleOptionId));
      const started = performance.now();
      const response = await server.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
      const elapsed = performance.now() - started;
      if (response.statusCode !== 200) throw new Error(`Benchmark search ${testCase.name} returned ${response.statusCode}: ${response.body.slice(0, 300)}`);
      const body = response.json() as { items: unknown[]; totalMatchedEntries: number };
      totalMatches = body.totalMatchedEntries;
      if (iteration >= 2) durations.push(elapsed);
    }
    durations.sort((left, right) => left - right);
    const percentile = (p: number) => durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)] ?? 0;
    const p95 = percentile(0.95);
    results.push({ name: testCase.name, query: testCase.query, samples: durations.length, totalMatchedEntries: totalMatches, returnedPageSize: Math.min(20, totalMatches), p50Ms: Number(percentile(0.5).toFixed(2)), p95Ms: Number(p95.toFixed(2)), targetMs: testCase.name === 'warm_exact_code' ? 150 : testCase.name === 'short_code_fallback_2_chars' ? null : 300, targetMet: testCase.name === 'short_code_fallback_2_chars' ? null : p95 <= (testCase.name === 'warm_exact_code' ? 150 : 300) });
  }
} finally {
  await server.close();
  db.close();
}
const memoryAfter = process.memoryUsage();
const report = {
  generatedAt: new Date().toISOString(),
  dataset: { version, databasePath, active: true, sourcePath: sourcePath ? resolve(sourcePath) : null, sourceVerification: { fullDatabaseHashMatch: migration.fullDatabaseHashMatch, rowHashMismatches: migration.rowHashMismatches, storedRowHashMismatches: migration.storedRowHashMismatches, integrityCheck: migration.integrityCheck, foreignKeyViolations: migration.foreignKeyViolations } },
  environment: { node: process.version, platform: process.platform, architecture: process.arch, cpuModel: os.cpus()[0]?.model ?? 'unknown', cpuCores: os.cpus().length, benchmarkHost: 'local Node.js API worker; same machine as the browser app' },
  method: { engine: 'Fastify inject through dedicated SQLite Worker thread', warmupRequestsPerCase: 2, measuredSamplesPerCase: samples, queryLimit: 20, timings: 'request start to complete response; sequential; no CPU throttling' },
  elapsedSeconds: Number(((performance.now() - serverStarted) / 1000).toFixed(2)),
  memory: { rssBeforeBytes: memoryBefore.rss, rssAfterBytes: memoryAfter.rss, heapUsedBeforeBytes: memoryBefore.heapUsed, heapUsedAfterBytes: memoryAfter.heapUsed },
  results,
  limitations: ['No original-HTML browser baseline was captured in the same run; this report is not a before/after performance claim.', 'The 1–2 character code fallback is measured separately and has no target threshold.', 'No representative Android handset was available for this run.'],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

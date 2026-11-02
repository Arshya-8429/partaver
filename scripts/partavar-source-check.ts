import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { extractLegacyDb } from '../packages/importer/src/extract-literal.js';
const root = resolve('private-data/reference-packs/PartAvar-Codex-Master-Pack/source');
const names = ['PartsFinder_Android-28_original.html', 'PartsFinder_Windows_v3_0_1.html', 'PartsFinder_Android_v3_0_1.html'];
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : value;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const rows: Array<{name:string;bytes:number;fileSha256:string;completeCatalogueSha256:string;rowCount:number;technicalCodes:number;logisticsCodes:number;rawModels:number;fields:Record<string,string>;metadata:Record<string,string>}> = [];
for (const name of names) {
  const bytes = await readFile(resolve(root, name)); const db = extractLegacyDb(bytes.toString('utf8'));
  rows.push({ name, bytes: bytes.length, fileSha256: hash(bytes), completeCatalogueSha256: hash(JSON.stringify(canonical(db))), rowCount: db.rows.length,
    technicalCodes: new Set(db.rows.map(row => row.tech)).size, logisticsCodes: new Set(db.rows.map(row => row.log)).size,
    rawModels: new Set(db.rows.flatMap(row => row.models)).size,
    fields: Object.fromEntries(['part','tech','log','price','models','friendly','aliases','replacement'].map(field => [field, hash(JSON.stringify(db.rows.map(row => canonical((row as unknown as Record<string, unknown>)[field]))))])),
    metadata: Object.fromEntries(Object.entries(db).filter(([key]) => key !== 'rows').map(([key, value]) => [key, hash(JSON.stringify(canonical(value)))])),
  });
}
const report = { generatedAt: new Date().toISOString(), sourceScriptsExecuted: false, allCatalogueObjectsEqual: rows.every(row => row.completeCatalogueSha256 === rows[0]!.completeCatalogueSha256), sources: rows,
  authority: 'Retain the already verified original catalogue. Both v3 sources have identical complete catalogue objects; their behavior remains the feature reference.', differences: [] };
await writeFile('reports/partavar/source-reconciliation.json', JSON.stringify(report, null, 2) + '\n');
if (!report.allCatalogueObjectsEqual) throw new Error('Source catalogues differ. Do not replace the active catalogue.');
process.stdout.write(JSON.stringify({ allCatalogueObjectsEqual: report.allCatalogueObjectsEqual, counts: rows.map(({ name, rowCount }) => ({ name, rowCount })) }) + '\n');

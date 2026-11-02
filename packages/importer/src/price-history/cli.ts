import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { PriceHistorySettings } from '../../../contracts/src/price-history.js';
import { backupPriceHistory, commitPriceHistory, previewPriceHistory, restorePriceHistory, rollbackPriceHistory, setPriceHistorySettings, stagePriceHistory, type HistoryColumnMapping } from './index.js';
import { readHistoryWorkbook } from './workbook.js';

/** Local operator only: no HTTP upload/write endpoint is registered. */
export async function runPriceHistoryCli(argv: string[]): Promise<unknown> {
  const command = argv[0];
  const { values } = parseArgs({ args: argv.slice(1).filter(arg => arg !== '--'), strict: true, allowPositionals: false, options: {
    source: { type: 'string' }, mapping: { type: 'string' }, version: { type: 'string' }, catalogue: { type: 'string' }, operations: { type: 'string' },
    batch: { type: 'string' }, supersedes: { type: 'string' }, actor: { type: 'string' }, reason: { type: 'string' }, output: { type: 'string' }, backup: { type: 'string' }, settings: { type: 'string' }, limit: { type: 'string' }, offset: { type: 'string' },
  } });
  const required = (key: keyof typeof values): string => { const value = values[key]; if (typeof value !== 'string' || !value.trim()) throw new Error(`Required --${key} is missing.`); return value; };
  const operationsPath = resolve(typeof values.operations === 'string' ? values.operations : 'private-data/sqlite/operations.db');
  const cataloguePath = resolve(typeof values.catalogue === 'string' ? values.catalogue : 'private-data/sqlite/catalogue.db');
  if (command === 'inspect') {
    const sourcePath = required('source');
    const loaded = await readHistoryWorkbook(sourcePath);
    return { sourceFileName: sourcePath.split(/[\\/]/).at(-1), sheets: loaded.workbook.worksheets.map(sheet => ({ name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount, preview: Array.from({ length: Math.min(sheet.rowCount, 5) }, (_, i) => sheet.getRow(i + 1).values) })), note: 'Preview only; supply an explicit mapping and trusted Gregorian effective dates before staging.' };
  }
  if (command === 'stage') {
    const mapping = JSON.parse(await readFile(required('mapping'), 'utf8')) as HistoryColumnMapping;
    return stagePriceHistory({ sourcePath: required('source'), cataloguePath, operationsPath, catalogueVersion: required('version'), mapping, ...(values.supersedes ? { supersedesBatchId: values.supersedes } : {}) });
  }
  if (command === 'preview') return previewPriceHistory(operationsPath, required('batch'), values.limit === undefined ? 100 : Number(values.limit), values.offset === undefined ? 0 : Number(values.offset));
  if (command === 'commit' || command === 'rollback') {
    const options = { cataloguePath, operationsPath, batchId: required('batch'), actor: required('actor'), reason: required('reason') };
    return command === 'commit' ? commitPriceHistory(options) : rollbackPriceHistory(options);
  }
  if (command === 'settings') return setPriceHistorySettings({ operationsPath, cataloguePath, actor: required('actor'), reason: required('reason'), settings: JSON.parse(await readFile(required('settings'), 'utf8')) as PriceHistorySettings });
  if (command === 'backup') return backupPriceHistory({ operationsPath, outputPath: resolve(required('output')) });
  if (command === 'restore') return restorePriceHistory({ operationsPath, backupPath: resolve(required('backup')) });
  throw new Error('Usage: price-history <inspect|stage|preview|commit|rollback|settings|backup|restore> --source FILE --mapping JSON --version VERSION --batch ID --actor NAME --reason TEXT --operations DB --catalogue DB --output DIR --backup DIR');
}

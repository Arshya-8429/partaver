import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { verifyCatalogue } from '../../packages/importer/src/verify.js';

describe('lossless source-to-SQLite round trip', () => {
  let directory = '';
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = '';
  });

  it('reconstructs every source row field, ordered relation, and top-level metadata from normalized tables', async () => {
    directory = await mkdtemp(join(tmpdir(), 'partsfinder-roundtrip-'));
    const sourcePath = resolve('PartsFinder_Android-28 (1) (1).html');
    const dbPath = join(directory, 'catalogue.db');
    const imported = await importCatalogue(sourcePath, { dbPath, dataRoot: directory });
    const report = await verifyCatalogue(imported.versionId, { dbPath, sourcePath });

    expect(report.integrityCheck).toBe('ok');
    expect(report.foreignKeyViolations).toBe(0);
    expect(report.rowHashMismatches).toBe(0);
    expect(report.fullRowsHashMatch).toBe(true);
    expect(report.metadataHashMatch).toBe(true);
    expect(report.fullDatabaseHashMatch).toBe(true);
    expect(report.fieldHashMatches).toEqual({
      part: true, models: true, tech: true, log: true, price: true,
      replacement: true, friendly: true, aliases: true,
    });
    expect(report.counts).toMatchObject({
      rows: 36_569,
      technicalCodes: 31_509,
      logisticsCodes: 36_569,
      names: 13_045,
      rawModels: 119,
      entryModelLinks: 192_630,
      friendlyLinks: 59_116,
      aliasLinks: 738,
      entriesWithoutModels: 1_809,
      entriesWithReplacement: 5_883,
      technicalCodesWithMultiplePrices: 3_750,
      sourcePriceSum: '5416428982434',
      rawPrimaryOptions: 40,
      effectivePrimaryOptions: 39,
      otherOptions: 77,
    });
    expect(report.priceRoundingDifferences).toBe(0);
  });
});

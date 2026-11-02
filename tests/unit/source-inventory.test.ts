import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import baseline from '../../PartsFinder-Codex-Architecture/baseline/source-inventory.json';
import { extractLegacyDb } from '../../packages/importer/src/extract-literal.js';
import { inventoryLegacyDb } from '../../packages/importer/src/validate.js';

describe('source baseline', () => {
  it('matches the archived SHA and all documented source inventory counts', () => {
    const sourcePath = resolve('PartsFinder_Android-28 (1) (1).html');
    const bytes = readFileSync(sourcePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(baseline.sha256);
    expect(bytes.byteLength).toBe(baseline.bytes);

    const db = extractLegacyDb(bytes.toString('utf8'));
    const inventory = inventoryLegacyDb(db);
    expect(inventory).toMatchObject({
      rowCount: baseline.row_count,
      uniqueTech: baseline.unique_tech,
      uniqueLog: baseline.unique_log,
      uniquePartNames: baseline.unique_part_names,
      rawModelCount: baseline.raw_model_count,
      noModels: baseline.no_models,
      noFriendly: baseline.no_friendly,
      techWithMultiplePrices: baseline.tech_with_multiple_prices,
      modelLinks: baseline.model_links_count_including_order,
      friendlyLinks: baseline.friendly_links_count_including_order,
      aliasLinks: baseline.alias_links_count_including_order,
      rowsWithReplacement: baseline.rows_with_replacement,
      sourcePriceSum: baseline.source_price_sum_exact_integer,
      rawPrimaryOptions: baseline.db_keys.primaryOptions,
      rawOtherOptions: baseline.db_keys.others,
      unknownTopLevelKeys: [],
      unknownRowKeys: [],
    });
  });
});

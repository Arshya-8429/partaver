import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculatePrices } from '../../packages/domain/src/pricing.js';
import { extractLegacyDb } from '../../packages/importer/src/extract-literal.js';

describe('integer catalogue pricing', () => {
  it('calculates both markups from the original base with integer half-up rounding', () => {
    expect(calculatePrices('1001')).toEqual({ base: '1001', middle: '1101', final: '1201' });
  });

  it('preserves large base prices without 32-bit truncation', () => {
    expect(calculatePrices('31433732625')).toEqual({
      base: '31433732625',
      middle: '34577105888',
      final: '37720479150',
    });
  });

  it('matches the original Math.round output for every source row', () => {
    const db = extractLegacyDb(readFileSync(resolve('PartsFinder_Android-28 (1) (1).html'), 'utf8'));
    for (const [ordinal, row] of db.rows.entries()) {
      const prices = calculatePrices(String(row.price));
      expect(prices.middle, `middle price mismatch at row ${ordinal}`).toBe(String(Math.round(row.price * 1.1)));
      expect(prices.final, `final price mismatch at row ${ordinal}`).toBe(String(Math.round(row.price * 1.2)));
    }
  });
});

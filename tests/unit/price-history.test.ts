import { describe, expect, it } from 'vitest';
import { calculateHistoryMetrics, classifyPriceHistory, DEFAULT_PRICE_HISTORY_SETTINGS, percentileRanks, parseHistoricalPrice, parseEffectiveDate } from '../../packages/domain/src/price-history.js';

const point = (price: string, effectiveDate: string | null, currencyUnit = 'IRR') => ({ price, effectiveDate, currencyUnit });

describe('historical price domain', () => {
  it('orders explicit dates and calculates exact changes beyond safe-number money', () => {
    const metrics = calculateHistoryMetrics([point('180143985094819860', '2025-02-01'), point('90071992547409930', '2025-01-01')]);
    expect(metrics).toMatchObject({ earliestPrice: '90071992547409930', latestPrice: '180143985094819860', absoluteChange: '90071992547409930', cumulativeChangeBps: '10000', previousChangeBps: '10000', observationCount: 2, firstDate: '2025-01-01', lastDate: '2025-02-01', neutralReason: null });
    expect(classifyPriceHistory(metrics, DEFAULT_PRICE_HISTORY_SETTINGS)).toBe('high');
  });
  it('uses direct threshold settings and keeps zero/negative growth low', () => {
    const metrics = calculateHistoryMetrics([point('100', '2025-01-01'), point('115', '2025-02-01')]);
    expect(classifyPriceHistory(metrics, { ...DEFAULT_PRICE_HISTORY_SETTINGS, highBps: 1000, mediumBps: 500 })).toBe('high');
    expect(classifyPriceHistory(metrics, { ...DEFAULT_PRICE_HISTORY_SETTINGS, highBps: 2000, mediumBps: 1000 })).toBe('medium');
    for (const latest of ['100', '80']) expect(classifyPriceHistory(calculateHistoryMetrics([point('100', '2025-01-01'), point(latest, '2025-02-01')]), DEFAULT_PRICE_HISTORY_SETTINGS)).toBe('low');
  });
  it('stays neutral for undated, ambiguous, unknown-currency, zero-baseline and date conflicts', () => {
    expect(calculateHistoryMetrics([point('100', null), point('200', null)]).neutralReason).toBe('undated_history');
    expect(calculateHistoryMetrics([point('0', '2025-01-01'), point('100', '2025-02-01')]).neutralReason).toBe('zero_baseline');
    expect(calculateHistoryMetrics([point('100', '2025-01-01'), point('110', '2025-01-01'), point('200', '2025-02-01')]).neutralReason).toBe('same_date_conflict');
    expect(calculateHistoryMetrics([point('100', '2025-01-01', 'UNKNOWN'), point('200', '2025-02-01', 'UNKNOWN')]).neutralReason).toBe('unknown_currency');
    expect(calculateHistoryMetrics([point('100', '2025-01-01'), point('200', '2025-02-01', 'TOMAN')])).toMatchObject({ neutralReason: 'mixed_currency', minPrice: null, maxPrice: null });
    expect(calculateHistoryMetrics([point('100', '2025-01-01'), point('200', '2025-02-01')], 1).neutralReason).toBe('ambiguous_history');
    expect(calculateHistoryMetrics([point('100', '2025-01-01'), point('100', '2025-01-01')]).observationCount).toBe(1);
  });
  it('computes deterministic tied percentile ranks without converting huge growth to floating point', () => {
    expect(percentileRanks(['-100', '0', '500', '500', '9999999999999999999999'])).toEqual([0, 2500, 6250, 6250, 10000]);
    const metrics = { ...calculateHistoryMetrics([point('100', '2025-01-01'), point('120', '2025-02-01')]), percentileBps: 9000 };
    expect(classifyPriceHistory(metrics, { ...DEFAULT_PRICE_HISTORY_SETTINGS, strategy: 'percentile' })).toBe('high');
    expect(() => classifyPriceHistory(metrics, { ...DEFAULT_PRICE_HISTORY_SETTINGS, highBps: 10, mediumBps: 20 })).toThrow();
  });
  it('parses explicit Persian/grouped integer prices and rejects unsafe or negative money', () => {
    expect(parseHistoricalPrice('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳')).toBe('9007199254740993');
    expect(parseHistoricalPrice('0')).toBe('0');
    for (const value of ['', '-1', '1.2', '1,23', 9007199254740992, '1e10']) expect(() => parseHistoricalPrice(value)).toThrow();
    expect(parseEffectiveDate('2024-02-29')).toBe('2024-02-29');
    for (const value of ['2025-02-29', '1403/01/01', 'today']) expect(() => parseEffectiveDate(value)).toThrow();
  });
});

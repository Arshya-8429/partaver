import type { HistoryClassification, HistoryMetrics, PriceHistorySettings } from '../../contracts/src/price-history.js';

export const DEFAULT_PRICE_HISTORY_SETTINGS: Readonly<PriceHistorySettings> = Object.freeze({ strategy: 'threshold', mediumBps: 1000, highBps: 3000, mediumPercentileBps: 3333, highPercentileBps: 6667, minimumObservations: 2 });

export function parseHistoricalPrice(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Price numeric cell must be a non-negative safe integer; use text for larger values.');
    return String(value);
  }
  if (typeof value !== 'string') throw new TypeError('Price must be integer text or a safe numeric cell.');
  const digits = value.trim().replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  if (!/^(?:\d+|\d{1,3}(?:[,٬]\d{3})+)$/.test(digits) || digits.length > 150) throw new TypeError('Price must be non-negative integer text with consistent thousands groups.');
  return BigInt(digits.replace(/[,٬]/g, '')).toString();
}

/** ISO Gregorian only. Jalali, locale dates and Excel serials require explicit operator conversion. */
export function parseEffectiveDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') throw new TypeError('Effective date must be explicit ISO Gregorian YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TypeError('Effective date is not a valid calendar date.');
  return value;
}

export interface HistoricalPoint { price: string; effectiveDate: string | null; currencyUnit: string }
const compareInteger = (a: string, b: string): number => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
function changeBps(from: string, to: string): string | null {
  const base = BigInt(from);
  if (base === 0n) return null;
  const delta = (BigInt(to) - base) * 10000n;
  const absolute = delta < 0n ? -delta : delta;
  return ((delta < 0n ? -1n : 1n) * ((absolute + base / 2n) / base)).toString();
}

export function calculateHistoryMetrics(points: readonly HistoricalPoint[], ambiguousCount = 0): HistoryMetrics {
  for (const point of points) { parseHistoricalPrice(point.price); if (point.effectiveDate !== null) parseEffectiveDate(point.effectiveDate); }
  const prices = points.map(p => p.price).sort(compareInteger);
  const dated = points.filter(p => p.effectiveDate !== null).sort((a, b) => a.effectiveDate!.localeCompare(b.effectiveDate!));
  const dates = new Map<string, HistoricalPoint[]>();
  for (const point of dated) dates.set(point.effectiveDate!, [...dates.get(point.effectiveDate!) ?? [], point]);
  const conflictDateCount = [...dates.values()].filter(group => new Set(group.map(p => `${p.price}:${p.currencyUnit}`)).size > 1).length;
  const chronological = [...dates.values()].map(group => group[0]!);
  const earliest = chronological[0];
  const latest = chronological.at(-1);
  const previous = chronological.at(-2);
  const currencies = new Set(points.map(p => p.currencyUnit));
  const undatedCount = points.length - dated.length;
  const neutralReason = ambiguousCount > 0 ? 'ambiguous_history' : conflictDateCount > 0 ? 'same_date_conflict' : currencies.size > 1 ? 'mixed_currency' : currencies.has('UNKNOWN') ? 'unknown_currency' : chronological.length < 2 ? undatedCount > 0 ? 'undated_history' : 'insufficient_history' : earliest?.price === '0' ? 'zero_baseline' : null;
  const trustworthy = !['same_date_conflict', 'mixed_currency'].includes(neutralReason ?? '');
  return {
    earliestPrice: trustworthy ? earliest?.price ?? null : null, latestPrice: trustworthy ? latest?.price ?? null : null,
    absoluteChange: trustworthy && earliest && latest ? (BigInt(latest.price) - BigInt(earliest.price)).toString() : null,
    cumulativeChangeBps: trustworthy && earliest && latest && chronological.length >= 2 ? changeBps(earliest.price, latest.price) : null,
    previousChangeBps: trustworthy && previous && latest ? changeBps(previous.price, latest.price) : null,
    observationCount: chronological.length, evidenceCount: points.length, undatedCount, conflictDateCount, ambiguousCount,
    minPrice: currencies.size > 1 ? null : prices[0] ?? null, maxPrice: currencies.size > 1 ? null : prices.at(-1) ?? null, firstDate: earliest?.effectiveDate ?? null, lastDate: latest?.effectiveDate ?? null,
    currencyUnit: currencies.size === 1 ? [...currencies][0]! : 'UNKNOWN', percentileBps: null, neutralReason,
  };
}

export function validateHistorySettings(settings: PriceHistorySettings): void {
  if (!['threshold', 'percentile'].includes(settings.strategy) || ![settings.mediumBps, settings.highBps, settings.mediumPercentileBps, settings.highPercentileBps, settings.minimumObservations].every(Number.isSafeInteger) || settings.mediumBps < 0 || settings.highBps < settings.mediumBps || settings.mediumPercentileBps < 0 || settings.highPercentileBps < settings.mediumPercentileBps || settings.highPercentileBps > 10000 || settings.minimumObservations < 2 || settings.minimumObservations > 100000) throw new TypeError('Invalid price-history classification settings.');
}

export function classifyPriceHistory(metrics: HistoryMetrics, settings: PriceHistorySettings = DEFAULT_PRICE_HISTORY_SETTINGS): HistoryClassification {
  validateHistorySettings(settings);
  if (metrics.neutralReason !== null || metrics.observationCount < settings.minimumObservations || metrics.cumulativeChangeBps === null) return 'neutral';
  const growth = BigInt(metrics.cumulativeChangeBps);
  if (growth <= 0n) return 'low';
  if (settings.strategy === 'percentile') {
    if (metrics.percentileBps === null) return 'neutral';
    return metrics.percentileBps >= settings.highPercentileBps ? 'high' : metrics.percentileBps >= settings.mediumPercentileBps ? 'medium' : 'low';
  }
  return growth >= BigInt(settings.highBps) ? 'high' : growth >= BigInt(settings.mediumBps) ? 'medium' : 'low';
}

/** Midrank ties, inclusive endpoints; a population of one has no relative signal. */
export function percentileRanks(values: readonly string[]): Array<number | null> {
  if (values.length < 2) return values.map(() => null);
  const sorted = [...values].sort(compareInteger);
  const ranks = new Map<string, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && compareInteger(sorted[start]!, sorted[end + 1]!) === 0) end++;
    ranks.set(BigInt(sorted[start]!).toString(), Math.round((start + end) * 5000 / (sorted.length - 1)));
    start = end + 1;
  }
  return values.map(value => ranks.get(BigInt(value).toString())!);
}

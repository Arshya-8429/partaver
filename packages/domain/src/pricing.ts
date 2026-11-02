import type { PriceBreakdown } from './types.js';

function sourceInteger(value: string | number | bigint): bigint {
  const raw = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new TypeError(`Invalid non-negative integer price: ${raw}`);
  return BigInt(raw);
}

function markedUp(base: bigint, basisPoints: bigint): bigint {
  return (base * (10_000n + basisPoints) + 5_000n) / 10_000n;
}

/** Derives both price levels directly from the exact source base, using integer half-up rounding. */
export function calculatePrices(value: string | number | bigint): PriceBreakdown {
  const base = sourceInteger(value);
  return {
    base: base.toString(),
    middle: markedUp(base, 1_000n).toString(),
    final: markedUp(base, 2_000n).toString(),
  };
}

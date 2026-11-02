import { describe, expect, it } from 'vitest';
import { estimateInstallStorageBytes, INDEXED_STORAGE_MULTIPLIER } from '../../apps/web/src/offline/storage-budget.js';

describe('offline storage preflight estimate', () => {
  it('allows measured IndexedDB amplification with headroom', () => {
    const decodedSnapshotBytes = 89_939_083;
    const observedIndexedDbBytes = 1_291_444_224;
    const estimate = estimateInstallStorageBytes(decodedSnapshotBytes);
    expect(INDEXED_STORAGE_MULTIPLIER).toBe(18);
    expect(estimate).toBe(1_618_903_494);
    expect(estimate).toBeGreaterThan(observedIndexedDbBytes);
  });

  it('rejects sizes that cannot be safely estimated', () => {
    expect(() => estimateInstallStorageBytes(-1)).toThrow(RangeError);
    expect(() => estimateInstallStorageBytes(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(() => estimateInstallStorageBytes(1.5)).toThrow(RangeError);
  });
});

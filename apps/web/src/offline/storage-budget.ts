/**
 * The full-catalogue Chromium run used 1,291,444,224 IndexedDB bytes for an
 * 89,939,083-byte decoded snapshot (~14.36x). Use 18x for preflight, giving
 * roughly 25% headroom over that measurement. This is a safety estimate, not
 * a browser-independent guarantee; storage engines and catalogue versions vary.
 */
export const INDEXED_STORAGE_MULTIPLIER = 18;

export function estimateInstallStorageBytes(decodedSnapshotBytes: number): number {
  if (!Number.isSafeInteger(decodedSnapshotBytes) || decodedSnapshotBytes < 0) {
    throw new RangeError('Decoded snapshot size must be a non-negative safe integer.');
  }
  const estimate = decodedSnapshotBytes * INDEXED_STORAGE_MULTIPLIER;
  if (!Number.isSafeInteger(estimate)) throw new RangeError('Estimated browser storage requirement exceeds the safe integer range.');
  return estimate;
}

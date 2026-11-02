import { createHash } from 'node:crypto';
import type { LegacyDb, LegacyRow } from '@partsfinder/domain';

export const ROW_FIELDS = ['part', 'models', 'tech', 'log', 'price', 'replacement', 'friendly', 'aliases'] as const;
export type RowField = (typeof ROW_FIELDS)[number];

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function hashRow(row: LegacyRow): string {
  return hashJson(row);
}

export function hashDatabaseRows(rows: LegacyRow[]): string {
  return hashJson(rows);
}

export function hashFields(rows: LegacyRow[]): Record<RowField, string> {
  return Object.fromEntries(ROW_FIELDS.map((field) => [field, hashJson(rows.map((row) => row[field]))])) as Record<RowField, string>;
}

export function hashFullDatabase(db: LegacyDb): string {
  return hashJson(db);
}

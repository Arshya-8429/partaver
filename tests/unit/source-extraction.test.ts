import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLegacyDb } from '../../packages/importer/src/extract-literal.js';

const sourcePath = resolve('PartsFinder_Android-28 (1) (1).html');

describe('safe legacy source extraction', () => {
  it('extracts the complete literal DB without evaluating application scripts', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const db = extractLegacyDb(source);
    expect(db.rows).toHaveLength(36_569);
    expect(Object.keys(db).sort()).toEqual(['groups', 'others', 'parts', 'primary', 'primaryOptions', 'rows']);
    expect(db.rows[0]?.tech).toBe('S11-5206500');
  });

  it('rejects executable DB initializers', () => {
    expect(() => extractLegacyDb('<script>const DB = (() => ({ rows: [] }))()</script>')).toThrow(/literal|initializer/i);
  });

  it('rejects duplicate top-level DB declarations', () => {
    const source = '<script>const DB = {"rows":[]}</script><script>const DB = {"rows":[]}</script>';
    expect(() => extractLegacyDb(source)).toThrow(/duplicate/i);
  });

  it('rejects non-JSON object values and preserves the input source', () => {
    expect(() => extractLegacyDb('<script>const DB = {rows: []}</script>')).toThrow(/JSON|literal/i);
    const original = readFileSync(sourcePath, 'utf8');
    expect(extractLegacyDb(original).rows).toHaveLength(36_569);
  });
});

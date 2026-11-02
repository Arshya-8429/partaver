import { describe, expect, it } from 'vitest';
import { normalizeCode, normalizeText } from '../../packages/domain/src/normalize.js';

describe('source-compatible normalization', () => {
  it('normalizes Arabic letters, digits, joiners, tatweel, and whitespace', () => {
    expect(normalizeText('  ي ك ة\u200c۱۲۳ ٤٥٦ـ  ')).toBe('ی ک ه 123 456');
  });

  it('retains code leading zeroes and meaningful hyphens', () => {
    expect(normalizeCode('0CF25B-1501113GA')).toBe('0cf25b-1501113ga');
    expect(normalizeCode(' 0CF25B _ – 01 ')).toBe('0cf25b-01');
  });

  it('does not rewrite raw values through normalization', () => {
    const raw = '٠CF25B-1501113GA';
    expect(normalizeCode(raw)).toBe('0cf25b-1501113ga');
    expect(raw).toBe('٠CF25B-1501113GA');
  });
});

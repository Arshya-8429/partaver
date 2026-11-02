import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPresetFamilies, buildVehicleOptions, suffix01Rank } from '../../packages/domain/src/vehicle-rules.js';
import { extractLegacyDb } from '../../packages/importer/src/extract-literal.js';

describe('vehicle option projection and source ranking rules', () => {
  it('keeps 40 raw primary options while exposing the 39-option AWD projection', () => {
    const db = extractLegacyDb(readFileSync(resolve('PartsFinder_Android-28 (1) (1).html'), 'utf8'));
    const options = buildVehicleOptions(db);
    expect(options.rawPrimary).toHaveLength(40);
    expect(options.primary).toHaveLength(39);
    const awd = options.primary.find((option) => option.label === 'Tiggo 7 Pro Max AWD');
    expect(awd?.models).toEqual(['TIGGO 7 Pro MAX AWD', 'TIGGO7  PRO MAX']);
    expect(options.others).toHaveLength(77);
  });

  it('ranks terminal -01 on either raw logistics or technical code without filtering siblings', () => {
    expect(suffix01Rank({ tech: 'ABC', log: 'ABC-01' })).toBe(0);
    expect(suffix01Rank({ tech: 'ABC-01', log: 'ABC-03' })).toBe(0);
    expect(suffix01Rank({ tech: 'ABC', log: 'ABC-02' })).toBe(1);
  });

  it('preserves the nine source quick-preset families over effective primary options', () => {
    const db = extractLegacyDb(readFileSync(resolve('PartsFinder_Android-28 (1) (1).html'), 'utf8'));
    const projection = buildVehicleOptions(db);
    const families = buildPresetFamilies(projection.primary);
    expect(families.map((family) => family.key)).toEqual(['x33', 'x55', 'x22', 't7', 't8', 'a5', 'a6', 'a8', 'fx']);
    expect(families.find((family) => family.key === 't7')?.options.map((option) => option.label)).toContain('Tiggo 7 Pro Max AWD');
  });
});

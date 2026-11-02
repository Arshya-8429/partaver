import { normalizeText, normalizeCode } from './normalize.js';
import type { LegacyDb, LegacyVehicleOption } from './types.js';

export interface VehicleOptionsProjection {
  rawPrimary: LegacyVehicleOption[];
  primary: LegacyVehicleOption[];
  rawOthers: string[];
  others: string[];
}

export interface PresetFamilyProjection {
  key: string;
  label: string;
  options: LegacyVehicleOption[];
}

const PRESET_FAMILY_RULES: ReadonlyArray<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'x33', label: 'X33 Cross', pattern: /^X33 Cross /i },
  { key: 'x55', label: 'X55 Pro', pattern: /^X55 Pro/i },
  { key: 'x22', label: 'X22 Pro', pattern: /^X22 Pro/i },
  { key: 't7', label: 'Tiggo 7', pattern: /^Tiggo 7/i },
  { key: 't8', label: 'Tiggo 8', pattern: /^Tiggo 8/i },
  { key: 'a5', label: 'Arrizo 5', pattern: /^Arrizo 5/i },
  { key: 'a6', label: 'Arrizo 6', pattern: /^Arrizo 6/i },
  { key: 'a8', label: 'Arrizo 8', pattern: /^Arrizo 8/i },
  { key: 'fx', label: 'FX', pattern: /^FX(?:\s|$)/i },
];

export function buildPresetFamilies(options: LegacyVehicleOption[]): PresetFamilyProjection[] {
  return PRESET_FAMILY_RULES.map(({ key, label, pattern }) => ({
    key,
    label,
    options: options.filter((option) => pattern.test(option.label)),
  }));
}

/** Keeps source metadata intact and applies only the two established legacy option filters. */
export function buildVehicleOptions(db: LegacyDb): VehicleOptionsProjection {
  const rawPrimary = db.primaryOptions.map((option) => ({ ...option, models: [...option.models] }));
  const primary = rawPrimary.map((option) => ({ ...option, models: [...option.models] }));
  const plain = primary.find((option) => normalizeText(option.label) === 'tiggo 7 pro max');
  const awd = primary.find((option) => normalizeText(option.label) === 'tiggo 7 pro max awd');

  if (plain && awd) awd.models = [...new Set([...awd.models, ...plain.models])];

  const rawOthers = [...db.others];
  return {
    rawPrimary,
    primary: primary.filter((option) => normalizeText(option.label) !== 'tiggo 7 pro max'),
    rawOthers,
    others: rawOthers.filter((value) => {
      const normalized = normalizeText(value);
      return normalized !== 'tiggo7 pro max' && normalized !== 'tiggo 7 pro max';
    }),
  };
}

/** Ranking preference only. A non-01 sibling remains a distinct catalogue entry. */
export function suffix01Rank(row: { tech?: string | null; log?: string | null }): 0 | 1 {
  const values = [row.log, row.tech].map(normalizeCode).filter(Boolean);
  return values.some((value) => /(?:^|-)01$/.test(value)) ? 0 : 1;
}

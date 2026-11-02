import type { LegacyDb, LegacyRow } from '@partsfinder/domain';

const ROW_FIELDS = ['part', 'models', 'tech', 'log', 'price', 'replacement', 'friendly', 'aliases'] as const;
const REQUIRED_DB_KEYS = ['rows', 'parts', 'primary', 'others', 'groups', 'primaryOptions'] as const;

export interface SourceInventory {
  rowCount: number;
  uniqueTech: number;
  uniqueLog: number;
  uniquePartNames: number;
  rawModelCount: number;
  noModels: number;
  noFriendly: number;
  techWithMultiplePrices: number;
  modelLinks: number;
  friendlyLinks: number;
  aliasLinks: number;
  rowsWithReplacement: number;
  sourcePriceSum: string;
  rawPrimaryOptions: number;
  rawOtherOptions: number;
  unknownTopLevelKeys: string[];
  unknownRowKeys: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== 'string') throw new TypeError(`${context} must be a string`);
  return value;
}

function requireStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${context} must be an ordered string array`);
  }
  return value as string[];
}

export function validateLegacyDb(value: unknown): asserts value is LegacyDb {
  if (!isRecord(value)) throw new TypeError('DB must be a JSON object');
  for (const key of REQUIRED_DB_KEYS) if (!(key in value)) throw new TypeError(`DB is missing required field: ${key}`);
  if (!Array.isArray(value.rows)) throw new TypeError('DB.rows must be an array');
  if (!Array.isArray(value.parts) || value.parts.some((item) => typeof item !== 'string')) {
    throw new TypeError('DB.parts must be an ordered string array');
  }
  if (!Array.isArray(value.primary) || value.primary.some((item) => typeof item !== 'string')) {
    throw new TypeError('DB.primary must be an ordered string array');
  }
  if (!isRecord(value.groups) || Object.entries(value.groups).some(([, models]) => !Array.isArray(models) || models.some((item) => typeof item !== 'string'))) {
    throw new TypeError('DB.groups must map family names to ordered string arrays');
  }
  if (!Array.isArray(value.others) || value.others.some((item) => typeof item !== 'string')) {
    throw new TypeError('DB.others must be an ordered string array');
  }
  if (!Array.isArray(value.primaryOptions)) throw new TypeError('DB.primaryOptions must be an array');

  value.rows.forEach((candidate, ordinal) => {
    if (!isRecord(candidate)) throw new TypeError(`DB.rows[${ordinal}] must be an object`);
    for (const field of ROW_FIELDS) if (!(field in candidate)) throw new TypeError(`DB.rows[${ordinal}] is missing ${field}`);
    const unknownFields = Object.keys(candidate).filter((key) => !(ROW_FIELDS as readonly string[]).includes(key));
    if (unknownFields.length) throw new TypeError(`DB.rows[${ordinal}] has unsupported fields: ${unknownFields.join(', ')}`);
    requireString(candidate.part, `DB.rows[${ordinal}].part`);
    requireStringArray(candidate.models, `DB.rows[${ordinal}].models`);
    requireString(candidate.tech, `DB.rows[${ordinal}].tech`);
    requireString(candidate.log, `DB.rows[${ordinal}].log`);
    if (!Number.isSafeInteger(candidate.price) || (candidate.price as number) < 0) {
      throw new TypeError(`DB.rows[${ordinal}].price must be a non-negative safe integer`);
    }
    requireString(candidate.replacement, `DB.rows[${ordinal}].replacement`);
    requireStringArray(candidate.friendly, `DB.rows[${ordinal}].friendly`);
    requireStringArray(candidate.aliases, `DB.rows[${ordinal}].aliases`);
  });

  value.primaryOptions.forEach((candidate, ordinal) => {
    if (!isRecord(candidate)) throw new TypeError(`DB.primaryOptions[${ordinal}] must be an object`);
    requireString(candidate.label, `DB.primaryOptions[${ordinal}].label`);
    requireStringArray(candidate.models, `DB.primaryOptions[${ordinal}].models`);
    if ('keywords' in candidate && typeof candidate.keywords !== 'string') {
      throw new TypeError(`DB.primaryOptions[${ordinal}].keywords must be a string when present`);
    }
  });
}

export function inventoryLegacyDb(db: LegacyDb): SourceInventory {
  const uniqueTech = new Set<string>();
  const uniqueLog = new Set<string>();
  const uniquePartNames = new Set<string>();
  const uniqueModels = new Set<string>();
  const pricesByTech = new Map<string, Set<number>>();
  let noModels = 0;
  let noFriendly = 0;
  let modelLinks = 0;
  let friendlyLinks = 0;
  let aliasLinks = 0;
  let rowsWithReplacement = 0;
  let sourcePriceSum = 0n;
  const unknownRowKeys = new Set<string>();

  for (const candidate of db.rows) {
    const row = candidate as LegacyRow & Record<string, unknown>;
    uniqueTech.add(row.tech);
    uniqueLog.add(row.log);
    uniquePartNames.add(row.part);
    row.models.forEach((model) => uniqueModels.add(model));
    if (!row.models.length) noModels++;
    if (!row.friendly.length) noFriendly++;
    modelLinks += row.models.length;
    friendlyLinks += row.friendly.length;
    aliasLinks += row.aliases.length;
    if (row.replacement.length) rowsWithReplacement++;
    sourcePriceSum += BigInt(row.price);
    const priceSet = pricesByTech.get(row.tech) ?? new Set<number>();
    priceSet.add(row.price);
    pricesByTech.set(row.tech, priceSet);
    for (const key of Object.keys(row)) if (!(ROW_FIELDS as readonly string[]).includes(key)) unknownRowKeys.add(key);
  }

  return {
    rowCount: db.rows.length,
    uniqueTech: uniqueTech.size,
    uniqueLog: uniqueLog.size,
    uniquePartNames: uniquePartNames.size,
    rawModelCount: uniqueModels.size,
    noModels,
    noFriendly,
    techWithMultiplePrices: [...pricesByTech.values()].filter((prices) => prices.size > 1).length,
    modelLinks,
    friendlyLinks,
    aliasLinks,
    rowsWithReplacement,
    sourcePriceSum: sourcePriceSum.toString(),
    rawPrimaryOptions: db.primaryOptions.length,
    rawOtherOptions: db.others.length,
    unknownTopLevelKeys: Object.keys(db).filter((key) => !(REQUIRED_DB_KEYS as readonly string[]).includes(key)).sort(),
    unknownRowKeys: [...unknownRowKeys].sort(),
  };
}

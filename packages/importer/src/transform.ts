import { buildPresetFamilies, buildVehicleOptions, type LegacyDb } from '@partsfinder/domain';
import { inventoryLegacyDb, type SourceInventory } from './validate.js';

export const SCHEMA_VERSION = 1;
export const NORMALIZATION_VERSION = 1;
export const RULES_VERSION = 1;
export const INDEX_FORMAT_VERSION = 1;

export interface CatalogueCounts {
  rows: number;
  technicalCodes: number;
  logisticsCodes: number;
  names: number;
  rawModels: number;
  entryModelLinks: number;
  friendlyLinks: number;
  aliasLinks: number;
  entriesWithoutModels: number;
  entriesWithReplacement: number;
  technicalCodesWithMultiplePrices: number;
  sourcePriceSum: string;
  rawPrimaryOptions: number;
  effectivePrimaryOptions: number;
  otherOptions: number;
  presetFamilies: number;
}

export function replacementTokens(value: string): string[] {
  return value === '' ? [] : value.split(/[,،;]/);
}

export function catalogueCounts(db: LegacyDb): { inventory: SourceInventory; counts: CatalogueCounts } {
  const inventory = inventoryLegacyDb(db);
  const vehicleProjection = buildVehicleOptions(db);
  const families = buildPresetFamilies(vehicleProjection.primary);
  return {
    inventory,
    counts: {
      rows: inventory.rowCount,
      technicalCodes: inventory.uniqueTech,
      logisticsCodes: inventory.uniqueLog,
      names: inventory.uniquePartNames,
      rawModels: inventory.rawModelCount,
      entryModelLinks: inventory.modelLinks,
      friendlyLinks: inventory.friendlyLinks,
      aliasLinks: inventory.aliasLinks,
      entriesWithoutModels: inventory.noModels,
      entriesWithReplacement: inventory.rowsWithReplacement,
      technicalCodesWithMultiplePrices: inventory.techWithMultiplePrices,
      sourcePriceSum: inventory.sourcePriceSum,
      rawPrimaryOptions: inventory.rawPrimaryOptions,
      effectivePrimaryOptions: vehicleProjection.primary.length,
      otherOptions: vehicleProjection.others.length,
      presetFamilies: families.length,
    },
  };
}

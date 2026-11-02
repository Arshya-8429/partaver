export type SearchMode = 'vehiclePart' | 'global';
export type SearchKind = 'auto' | 'code' | 'name';
export type GroupingMode = 'entry' | 'family' | 'variant';
export type MatchType =
  | 'technicalExact' | 'logisticsExact' | 'replacementExact'
  | 'technicalPrefix' | 'logisticsPrefix' | 'replacementPrefix'
  | 'technicalInfix' | 'logisticsInfix' | 'replacementInfix'
  | 'nameExact' | 'aliasExact' | 'namePrefix' | 'namePhrase' | 'aliasPhrase'
  | 'nameTerms' | 'aliasTerms';
export type CurrencyUnit = 'UNKNOWN' | 'IRR' | 'TOMAN';

export interface SearchRequest {
  catalogVersion: string;
  mode: SearchMode;
  kind: SearchKind;
  query: string;
  vehicleOptionId?: number;
  familyRoot?: string;
  partId?: number;
  groupBy: GroupingMode;
  limit: number;
  cursor?: string;
}

export interface EntrySummary {
  type: 'entry';
  entryId: number;
  partId: number;
  partNameRaw: string;
  techRaw: string;
  logRaw: string;
  replacementRaw: string;
  matchType: MatchType;
  basePrice: string;
  middlePrice: string;
  finalPrice: string;
  currencyUnit: CurrencyUnit;
  suffix01Rank: 0 | 1;
  family: { root: string; variant: string; verified: false };
  modelCount: number;
  aliasCount: number;
  replacementCount: number;
}

export interface FamilySummary {
  type: 'family';
  displayRoot: string;
  representative: EntrySummary;
  matchedEntryCount: number;
  variantCount: number;
  verified: false;
}

export interface VariantSummary {
  type: 'variant';
  partId: number;
  techRaw: string;
  partNameRaw: string;
  matchedEntryCount: number;
}

export type SearchItem = EntrySummary | FamilySummary | VariantSummary;

export interface SearchPage {
  catalogVersion: string;
  normalizationVersion: number;
  items: SearchItem[];
  totalMatchedEntries: number;
  totalMatchedFamilies?: number;
  totalMatchedVariants?: number;
  nextCursor: string | null;
}

export interface EntryDetail extends Omit<EntrySummary, 'matchType'> {
  models: string[];
  friendlyLabels: string[];
  aliases: string[];
  replacementTokens: Array<{ raw: string; targetTechRaw: string | null }>;
  sourceRowOrdinal: number;
}

export type EntryListing = Omit<EntrySummary, 'matchType'>;

export interface EntryListingPage {
  catalogVersion: string;
  partId: number;
  items: EntryListing[];
  totalEntries: number;
  nextCursor: string | null;
}

export interface VehicleOption {
  id: number;
  kind: 'main' | 'other';
  labelRaw: string;
  keywordsRaw: string;
  models: string[];
  displayOrder: number;
}

export interface CatalogueManifest {
  catalogVersion: string;
  schemaVersion: number;
  normalizationVersion: number;
  rulesVersion: number;
  indexFormatVersion: number;
  sourceSha256: string;
  currencyUnit: CurrencyUnit;
  priceEffectiveAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  counts: Record<string, number | string>;
  snapshotManifestPath: string | null;
  rowCount: number;
}

export interface SnapshotChunkDescriptor {
  id: string;
  path: string;
  table: string;
  ordinal: number;
  recordCount: number;
  decodedBytes: number;
  sha256: string;
}

export interface SnapshotManifest {
  catalogVersion: string;
  schemaVersion: number;
  normalizationVersion: number;
  rulesVersion: number;
  indexFormatVersion: number;
  sourceSha256: string;
  currencyUnit: CurrencyUnit;
  priceEffectiveAt: string | null;
  createdAt: string;
  counts: Record<string, number | string>;
  rowCount: number;
  totalDecodedBytes: number;
  chunks: SnapshotChunkDescriptor[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

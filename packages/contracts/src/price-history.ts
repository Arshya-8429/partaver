/** Historical prices are decimal strings; ratio basis points remain exact integer strings. */
export type HistoryClassification = 'high' | 'medium' | 'low' | 'neutral';
export type HistoryNeutralReason = 'insufficient_history' | 'undated_history' | 'ambiguous_history' | 'same_date_conflict' | 'unknown_currency' | 'mixed_currency' | 'zero_baseline' | null;
export interface PriceHistorySettings {
  strategy: 'threshold' | 'percentile';
  mediumBps: number;
  highBps: number;
  mediumPercentileBps: number;
  highPercentileBps: number;
  minimumObservations: number;
}
export interface HistoryMetrics {
  earliestPrice: string | null;
  latestPrice: string | null;
  absoluteChange: string | null;
  cumulativeChangeBps: string | null;
  previousChangeBps: string | null;
  observationCount: number;
  evidenceCount: number;
  undatedCount: number;
  conflictDateCount: number;
  ambiguousCount: number;
  minPrice: string | null;
  maxPrice: string | null;
  firstDate: string | null;
  lastDate: string | null;
  currencyUnit: string;
  percentileBps: number | null;
  neutralReason: HistoryNeutralReason;
}
export interface PriceHistorySummaryItem extends HistoryMetrics {
  entryId: number;
  classification: HistoryClassification;
}
export interface PriceHistorySummaryDto {
  catalogVersion: string;
  revision: number;
  settings: PriceHistorySettings;
  items: PriceHistorySummaryItem[];
}
export interface PriceHistoryObservationDto {
  observationId: string;
  batchId: string;
  effectiveDate: string | null;
  price: string;
  rawPrice: string;
  currencyUnit: string;
  technicalCodeRaw: string;
  logisticsCodeRaw: string;
  sourceFileName: string;
  sourceSha256: string;
  sourceSheet: string;
  sourceRow: number;
  matchStatus: string;
}
export interface PriceHistoryEntryDto {
  catalogVersion: string;
  entryId: number;
  summary: PriceHistorySummaryItem;
  observations: PriceHistoryObservationDto[];
  nextCursor: string | null;
}
export interface PriceHistoryListItem extends PriceHistorySummaryItem {
  partNameRaw: string;
  techRaw: string;
  logRaw: string;
  basePrice: string;
}
export interface PriceHistoryListDto {
  catalogVersion: string;
  revision: number;
  settings: PriceHistorySettings;
  items: PriceHistoryListItem[];
  totalEntries: number;
  nextCursor: string | null;
}

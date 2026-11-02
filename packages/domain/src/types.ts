export interface LegacyRow {
  part: string;
  models: string[];
  tech: string;
  log: string;
  price: number;
  replacement: string;
  friendly: string[];
  aliases: string[];
}

export interface LegacyVehicleOption {
  label: string;
  models: string[];
  keywords?: string;
  [key: string]: unknown;
}

export interface LegacyDb {
  rows: LegacyRow[];
  parts: string[];
  primary: string[];
  others: string[];
  groups: Record<string, string[]>;
  primaryOptions: LegacyVehicleOption[];
  [key: string]: unknown;
}

export interface PriceBreakdown {
  base: string;
  middle: string;
  final: string;
}

import Dexie, { type Table } from 'dexie';

export interface MetaRecord {
  key: string;
  value: string | number | boolean | null;
  updatedAt: string;
}

export interface CatalogueVersionRecord {
  version: string;
  sourceSha256: string;
  status: 'downloading' | 'importing' | 'indexing' | 'validating' | 'ready' | 'failed';
  counts: Record<string, number | string>;
  rowCount: number;
  manifestSha256: string;
  etag?: string;
  totalDecodedBytes: number;
  schemaVersion: number;
  normalizationVersion: number;
  rulesVersion: number;
  currencyUnit: 'UNKNOWN' | 'IRR' | 'TOMAN';
  priceEffectiveAt: string | null;
  importedAt: string;
  failure?: string;
}

export interface VersionedRecord {
  id?: number;
  version: string;
  [key: string]: unknown;
}

export interface RelationRecord {
  version: string;
  entryId?: number;
  optionId?: number;
  familyKey?: string;
  ordinal?: number;
  [key: string]: unknown;
}

export interface SearchDocumentRecord extends VersionedRecord {
  id: number;
  kind: 'name' | 'alias' | 'tech' | 'log' | 'replacement';
  rawValue: string;
  normalizedValue: string;
  gramKeys?: string[];
}

export interface InstallChunkRecord {
  version: string;
  chunkId: string;
  sha256: string;
  recordCount: number;
  completedAt: string;
}

export interface InstallerLeaseRecord {
  key: 'catalogue-installer';
  owner: string;
  version: string;
  expiresAt: number;
  updatedAt: string;
}

export class CatalogueReplicaDatabase extends Dexie {
  meta!: Table<MetaRecord, string>;
  catalogVersions!: Table<CatalogueVersionRecord, string>;
  entries!: Table<VersionedRecord, [string, number]>;
  parts!: Table<VersionedRecord, [string, number]>;
  partNames!: Table<VersionedRecord, [string, number]>;
  models!: Table<VersionedRecord, [string, number]>;
  entryModels!: Table<RelationRecord, [string, number, number]>;
  friendlyLabels!: Table<RelationRecord, [string, number, number]>;
  aliases!: Table<RelationRecord, [string, number, number]>;
  replacements!: Table<RelationRecord, [string, number, number]>;
  vehicleOptions!: Table<VersionedRecord, [string, number]>;
  optionModels!: Table<RelationRecord, [string, number, number]>;
  presetFamilies!: Table<RelationRecord, [string, string]>;
  presetFamilyOptions!: Table<RelationRecord, [string, string, number]>;
  searchDocuments!: Table<SearchDocumentRecord, [string, number]>;
  entrySearchDocuments!: Table<RelationRecord, [string, number, number]>;
  installChunks!: Table<InstallChunkRecord, [string, string]>;
  installerLease!: Table<InstallerLeaseRecord, string>;

  constructor() {
    super('PartsFinderCatalogue');
    this.version(1).stores({
      meta: 'key',
      catalogVersions: 'version,status',
      entries: '[version+id],version,[version+techNorm],[version+logNorm],[version+partId],[version+sourceRowOrdinal],[version+suffix01Rank]',
      parts: '[version+id],version,[version+techNorm],[version+nameId]',
      partNames: '[version+id],version,[version+nameNorm],[version+sortRank]',
      models: '[version+id],version,[version+nameNorm]',
      entryModels: '[version+entryId+ordinal],version,[version+modelId+entryId]',
      friendlyLabels: '[version+entryId+ordinal],version',
      aliases: '[version+entryId+ordinal],version',
      replacements: '[version+entryId+ordinal],version,[version+tokenNorm]',
      vehicleOptions: '[version+id],version,[version+kind+displayOrder],[version+labelNorm]',
      optionModels: '[version+optionId+ordinal],version,[version+modelId]',
      presetFamilies: '[version+familyKey],version,[version+displayOrder]',
      presetFamilyOptions: '[version+familyKey+optionId],version,[version+optionId]',
      searchDocuments: '[version+id],version,[version+kind+normalizedValue],*gramKeys',
      entrySearchDocuments: '[version+entryId+docId],version,[version+docId+entryId],[version+docId]',
      installChunks: '[version+chunkId],[version+sha256]',
      installerLease: 'key,expiresAt',
    });
  }
}

export const catalogueReplica = new CatalogueReplicaDatabase();

export async function activeCatalogueVersion(): Promise<string | null> {
  return (await catalogueReplica.meta.get('activeCatalogVersion'))?.value?.toString() ?? null;
}

export async function setLocalMetadata(key: string, value: MetaRecord['value']): Promise<void> {
  await catalogueReplica.meta.put({ key, value, updatedAt: new Date().toISOString() });
}

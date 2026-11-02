import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { calculatePrices, normalizeCode, normalizeText, splitSearchTerms } from '@partsfinder/domain';
import type { EntrySummary, MatchType, SearchItem, SearchPage, SearchRequest } from '@partsfinder/contracts';

const NORMALIZATION_VERSION = 1;
const RANKING_VERSION = 1;
const CODE_KINDS = ['tech', 'log', 'replacement'] as const;
const NAME_KINDS = ['name', 'alias'] as const;
type DocKind = 'name' | 'alias' | 'tech' | 'log' | 'replacement';
type CodeDocKind = 'tech' | 'log' | 'replacement';

interface SearchDocument {
  id: number;
  kind: DocKind;
  raw_value: string;
  normalized_value: string;
}

interface EntryRow {
  entry_id: number;
  part_id: number;
  part_name_raw: string;
  tech_raw: string;
  log_raw: string;
  replacement_raw: string;
  base_price: string;
  suffix01_rank: 0 | 1;
  family_root: string;
  family_variant: string;
  name_sort_rank: number;
  tech_sort_rank: number;
  source_row_ordinal: number;
  model_count: number;
  alias_count: number;
  replacement_count: number;
}

interface SortTuple {
  matchRank: number;
  nameLength: number;
  suffix01Rank: number;
  basePrice: string;
  nameSortRank: number;
  techSortRank: number;
  sourceRowOrdinal: number;
  entryId: number;
}

interface CursorPayload {
  version: string;
  fingerprint: string;
  tuple: SortTuple;
}

interface ScoredEntry {
  item: EntrySummary;
  matchRank: number;
  nameSortRank: number;
  techSortRank: number;
  sourceRowOrdinal: number;
}

export class SearchServiceError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

function invalid(message: string): never {
  throw new SearchServiceError('INVALID_SEARCH_REQUEST', 400, message);
}

function validateRequest(request: SearchRequest): { normalizedQuery: string; codeQuery: string; terms: string[] } {
  if (!request || typeof request !== 'object') invalid('A search request is required.');
  if (!/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(request.catalogVersion)) invalid('The catalogue version identifier is malformed.');
  if (!['vehiclePart', 'global'].includes(request.mode)) invalid('Unsupported search mode.');
  if (!['auto', 'code', 'name'].includes(request.kind)) invalid('Unsupported search kind.');
  if (!['entry', 'family', 'variant'].includes(request.groupBy)) invalid('Unsupported result grouping.');
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) invalid('Limit must be an integer from 1 to 100.');
  if (typeof request.query !== 'string' || [...request.query].length > 128) invalid('Query must be at most 128 Unicode characters.');
  const normalizedQuery = normalizeText(request.query);
  if (!normalizedQuery) invalid('Enter a search term.');
  const terms = splitSearchTerms(normalizedQuery);
  if (!terms.length || terms.length > 8) invalid('Query must contain from 1 to 8 non-empty terms.');
  if (request.mode === 'vehiclePart') {
    if (!Number.isSafeInteger(request.vehicleOptionId) || (request.vehicleOptionId ?? 0) <= 0) invalid('A valid vehicle option is required for vehicle-part search.');
    if (request.kind === 'code') invalid('Vehicle-part search supports part names and aliases.');
  }
  if (request.mode === 'global' && request.vehicleOptionId !== undefined) invalid('Global search cannot include a vehicle option.');
  if (request.familyRoot !== undefined && (!request.familyRoot || [...request.familyRoot].length > 128)) invalid('Family root is malformed.');
  if (request.partId !== undefined && (!Number.isSafeInteger(request.partId) || request.partId < 1)) invalid('Part ID must be a positive safe integer.');
  if (request.cursor !== undefined && (request.cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(request.cursor))) invalid('Cursor is malformed.');
  const codeQuery = normalizeCode(request.query);
  return { normalizedQuery, codeQuery, terms };
}

function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function matchingDocuments(db: Database.Database, version: string, kinds: readonly DocKind[], value: string): Promise<SearchDocument[]> {
  const unique = new Map<number, SearchDocument>();
  const placeholders = kinds.map(() => '?').join(',');
  const prefix = db.prepare(`
    SELECT id, kind, raw_value, normalized_value
    FROM search_documents
    WHERE version_id=? AND kind IN (${placeholders}) AND normalized_value >= ? AND normalized_value < ?
  `).all(version, ...kinds, value, `${value}\uffff`) as SearchDocument[];
  for (const row of prefix) if (row.normalized_value.includes(value)) unique.set(row.id, row);

  if ([...value].length >= 3) {
    const infix = db.prepare(`
      SELECT d.id, d.kind, d.raw_value, d.normalized_value
      FROM search_fts JOIN search_documents d ON d.id=search_fts.rowid
      WHERE search_fts MATCH ? AND d.version_id=? AND d.kind IN (${placeholders})
    `).all(ftsPhrase(value), version, ...kinds) as SearchDocument[];
    for (const row of infix) if (row.normalized_value.includes(value)) unique.set(row.id, row);
  } else {
    // Trigram FTS cannot represent short substrings. Scan the compact distinct-value dictionary
    // in the database worker, yielding every 500 records so cancellation and other messages run.
    const scan = db.prepare(`
      SELECT id, kind, raw_value, normalized_value
      FROM search_documents WHERE version_id=? AND kind IN (${placeholders}) ORDER BY id
    `).iterate(version, ...kinds) as IterableIterator<SearchDocument>;
    let scanned = 0;
    for (const row of scan) {
      if (row.normalized_value.includes(value)) unique.set(row.id, row);
      scanned++;
      if (scanned % 500 === 0) await yieldToWorker();
    }
  }
  return [...unique.values()];
}

function entryIdsForDocuments(db: Database.Database, version: string, documentIds: number[]): Set<number> {
  const entryIds = new Set<number>();
  for (let offset = 0; offset < documentIds.length; offset += 400) {
    const chunk = documentIds.slice(offset, offset + 400);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT DISTINCT entry_id FROM entry_search_documents
      WHERE version_id=? AND doc_id IN (${placeholders})
    `).all(version, ...chunk) as Array<{ entry_id: number }>;
    for (const row of rows) entryIds.add(row.entry_id);
  }
  return entryIds;
}

function intersect(sets: Set<number>[]): Set<number> {
  if (!sets.length) return new Set();
  sets.sort((left, right) => left.size - right.size);
  const first = sets[0];
  if (!first) return new Set();
  const result = new Set<number>();
  for (const value of first) if (sets.every((set) => set.has(value))) result.add(value);
  return result;
}

function getVehicleEntryIds(db: Database.Database, version: string, optionId: number): Set<number> {
  const option = db.prepare('SELECT id FROM vehicle_options WHERE version_id=? AND id=?').get(version, optionId);
  if (!option) invalid('The selected vehicle option does not exist in this catalogue version.');
  const rows = db.prepare(`
    SELECT DISTINCT evm.entry_id
    FROM vehicle_option_models vom
    JOIN entry_vehicle_models evm ON evm.version_id=vom.version_id AND evm.model_id=vom.model_id
    WHERE vom.version_id=? AND vom.option_id=?
  `).all(version, optionId) as Array<{ entry_id: number }>;
  return new Set(rows.map((row) => row.entry_id));
}

function requestFingerprint(request: SearchRequest, normalizedQuery: string): string {
  const input = JSON.stringify({
    version: request.catalogVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    rankingVersion: RANKING_VERSION,
    mode: request.mode,
    kind: request.kind,
    query: normalizedQuery,
    vehicleOptionId: request.vehicleOptionId ?? null,
    familyRoot: request.familyRoot ?? null,
    partId: request.partId ?? null,
    groupBy: request.groupBy,
  });
  return createHash('sha256').update(input).digest('hex');
}

function decodeCursor(cursor: string | undefined, version: string, fingerprint: string): SortTuple | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    const tuple = decoded.tuple;
    if (decoded.version !== version || decoded.fingerprint !== fingerprint || !tuple ||
      !Number.isInteger(tuple.matchRank) || !Number.isInteger(tuple.nameLength) ||
      ![0, 1].includes(tuple.suffix01Rank) || !/^(0|[1-9]\d*)$/.test(tuple.basePrice) ||
      !Number.isInteger(tuple.nameSortRank) || !Number.isInteger(tuple.techSortRank) ||
      !Number.isInteger(tuple.sourceRowOrdinal) || !Number.isSafeInteger(tuple.entryId)) {
      invalid('Cursor does not match this version, query, or filter.');
    }
    return tuple;
  } catch (error) {
    if (error instanceof SearchServiceError) throw error;
    invalid('Cursor is malformed.');
  }
}

function tupleFor(entry: ScoredEntry): SortTuple {
  return {
    matchRank: entry.matchRank,
    nameLength: [...entry.item.partNameRaw].length,
    suffix01Rank: entry.item.suffix01Rank,
    basePrice: entry.item.basePrice,
    nameSortRank: entry.nameSortRank,
    techSortRank: entry.techSortRank,
    sourceRowOrdinal: entry.sourceRowOrdinal,
    entryId: entry.item.entryId,
  };
}

function compareTuples(left: SortTuple, right: SortTuple): number {
  return left.matchRank - right.matchRank ||
    left.nameLength - right.nameLength ||
    left.suffix01Rank - right.suffix01Rank ||
    (BigInt(left.basePrice) > BigInt(right.basePrice) ? -1 : BigInt(left.basePrice) < BigInt(right.basePrice) ? 1 : 0) ||
    left.nameSortRank - right.nameSortRank ||
    left.techSortRank - right.techSortRank ||
    left.sourceRowOrdinal - right.sourceRowOrdinal ||
    left.entryId - right.entryId;
}

function matchCode(kind: CodeDocKind, value: string, query: string): { matchType: MatchType; rank: number } | null {
  if (!query || !value.includes(query)) return null;
  const exact = value === query;
  const prefix = !exact && value.startsWith(query);
  const kindRank = kind === 'tech' ? 0 : kind === 'log' ? 1 : 2;
  const matchType: MatchType = exact
    ? kind === 'tech' ? 'technicalExact' : kind === 'log' ? 'logisticsExact' : 'replacementExact'
    : prefix
      ? kind === 'tech' ? 'technicalPrefix' : kind === 'log' ? 'logisticsPrefix' : 'replacementPrefix'
      : kind === 'tech' ? 'technicalInfix' : kind === 'log' ? 'logisticsInfix' : 'replacementInfix';
  return { matchType, rank: (exact ? 0 : prefix ? 3 : 6) + kindRank };
}

function matchName(docs: SearchDocument[], query: string, terms: string[]): { matchType: MatchType; rank: number } | null {
  const names = docs.filter((doc) => doc.kind === 'name');
  const aliases = docs.filter((doc) => doc.kind === 'alias');
  if (names.some((doc) => doc.normalized_value === query)) return { matchType: 'nameExact', rank: 0 };
  if (aliases.some((doc) => doc.normalized_value === query)) return { matchType: 'aliasExact', rank: 1 };
  if (names.some((doc) => doc.normalized_value.startsWith(query))) return { matchType: 'namePrefix', rank: 2 };
  if (names.some((doc) => doc.normalized_value.includes(query))) return { matchType: 'namePhrase', rank: 3 };
  if (aliases.some((doc) => doc.normalized_value.includes(query))) return { matchType: 'aliasPhrase', rank: 4 };
  if (names.some((doc) => terms.every((term) => doc.normalized_value.includes(term)))) return { matchType: 'nameTerms', rank: 5 };
  return { matchType: 'aliasTerms', rank: 6 };
}

function overallRank(request: SearchRequest, path: 'code' | 'name', match: { rank: number }): number {
  if (request.kind !== 'auto') return match.rank;
  if (path === 'code') return match.rank <= 2 ? match.rank : 5 + match.rank;
  return match.rank <= 1 ? 3 + match.rank : 20 + match.rank;
}

function overallMatchType(
  request: SearchRequest,
  codeMatch: { matchType: MatchType; rank: number } | null,
  nameMatch: { matchType: MatchType; rank: number } | null,
): { matchType: MatchType; rank: number } | null {
  const matches: Array<{ matchType: MatchType; rank: number }> = [];
  if (codeMatch && request.kind !== 'name') matches.push({ matchType: codeMatch.matchType, rank: overallRank(request, 'code', codeMatch) });
  if (nameMatch && request.kind !== 'code') matches.push({ matchType: nameMatch.matchType, rank: overallRank(request, 'name', nameMatch) });
  matches.sort((a, b) => a.rank - b.rank);
  return matches[0] ?? null;
}

function cursorFor(version: string, fingerprint: string, tuple: SortTuple): string {
  return Buffer.from(JSON.stringify({ version, fingerprint, tuple } satisfies CursorPayload)).toString('base64url');
}

export async function searchCatalogue(db: Database.Database, request: SearchRequest): Promise<SearchPage> {
  const { normalizedQuery, codeQuery, terms } = validateRequest(request);
  const versionRow = db.prepare('SELECT status FROM catalog_versions WHERE id=?').get(request.catalogVersion) as { status: string } | undefined;
  if (!versionRow || versionRow.status !== 'published') {
    throw new SearchServiceError('CATALOG_VERSION_UNAVAILABLE', 409, 'This catalogue version is not available for search.');
  }
  const fingerprint = requestFingerprint(request, normalizedQuery);
  const after = decodeCursor(request.cursor, request.catalogVersion, fingerprint);

  const codeEnabled = request.mode === 'global' && request.kind !== 'name';
  const nameEnabled = request.kind !== 'code';
  let codeIds = new Set<number>();
  if (codeEnabled && codeQuery) {
    const codeDocs = await matchingDocuments(db, request.catalogVersion, CODE_KINDS, codeQuery);
    codeIds = entryIdsForDocuments(db, request.catalogVersion, codeDocs.map((doc) => doc.id));
  }

  let nameIds = new Set<number>();
  if (nameEnabled) {
    const termSets: Set<number>[] = [];
    for (const term of terms) {
      const docs = await matchingDocuments(db, request.catalogVersion, NAME_KINDS, term);
      termSets.push(entryIdsForDocuments(db, request.catalogVersion, docs.map((doc) => doc.id)));
      await yieldToWorker();
    }
    nameIds = intersect(termSets);
  }

  const candidateIds = new Set([...codeIds, ...nameIds]);
  let vehicleIds: Set<number> | null = null;
  if (request.mode === 'vehiclePart') {
    vehicleIds = getVehicleEntryIds(db, request.catalogVersion, request.vehicleOptionId as number);
  }
  if (vehicleIds) for (const id of candidateIds) if (!vehicleIds.has(id)) candidateIds.delete(id);

  const entries: EntryRow[] = [];
  const associatedDocs = new Map<number, SearchDocument[]>();
  for (const idsChunk of [...Array(Math.ceil(candidateIds.size / 400)).keys()].map((index) => [...candidateIds].slice(index * 400, (index + 1) * 400))) {
    const placeholders = idsChunk.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT e.id AS entry_id, e.part_id, pn.name_raw AS part_name_raw, p.tech_raw, e.log_raw,
        e.replacement_raw, CAST(e.base_price AS TEXT) AS base_price, e.suffix01_rank,
        COALESCE(cf.display_root, p.tech_raw) AS family_root,
        COALESCE(cf.variant_label, 'BASE') AS family_variant,
        pn.name_sort_rank, p.tech_sort_rank, e.source_row_ordinal,
        (SELECT COUNT(*) FROM entry_vehicle_models vm WHERE vm.version_id=e.version_id AND vm.entry_id=e.id) AS model_count,
        (SELECT COUNT(*) FROM entry_aliases a WHERE a.version_id=e.version_id AND a.entry_id=e.id) AS alias_count,
        (SELECT COUNT(*) FROM entry_replacements r WHERE r.version_id=e.version_id AND r.entry_id=e.id) AS replacement_count
      FROM catalog_entries e
      JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
      JOIN part_names pn ON pn.version_id=p.version_id AND pn.id=p.name_id
      LEFT JOIN code_family_members cf ON cf.version_id=p.version_id AND cf.part_id=p.id
      WHERE e.version_id=? AND e.id IN (${placeholders})
    `).all(request.catalogVersion, ...idsChunk) as EntryRow[];
    entries.push(...rows);

    const docRows = db.prepare(`
      SELECT esd.entry_id, d.id, d.kind, d.raw_value, d.normalized_value
      FROM entry_search_documents esd
      JOIN search_documents d ON d.version_id=esd.version_id AND d.id=esd.doc_id
      WHERE esd.version_id=? AND esd.entry_id IN (${placeholders})
    `).all(request.catalogVersion, ...idsChunk) as Array<SearchDocument & { entry_id: number }>;
    for (const row of docRows) {
      const list = associatedDocs.get(row.entry_id) ?? [];
      list.push(row);
      associatedDocs.set(row.entry_id, list);
    }
    await yieldToWorker();
  }

  const scored: ScoredEntry[] = [];
  for (const row of entries) {
    const docs = associatedDocs.get(row.entry_id) ?? [];
    const codeMatches = docs.flatMap((doc) => CODE_KINDS.includes(doc.kind as CodeDocKind)
      ? [matchCode(doc.kind as CodeDocKind, doc.normalized_value, codeQuery)].filter((match): match is NonNullable<typeof match> => match !== null)
      : []);
    codeMatches.sort((left, right) => left.rank - right.rank);
    const nameMatch = matchName(docs, normalizedQuery, terms);
    const selected = overallMatchType(request, codeMatches[0] ?? null, nameMatch);
    if (!selected) continue;
    const prices = calculatePrices(row.base_price);
    scored.push({
      item: {
        type: 'entry',
        entryId: row.entry_id,
        partId: row.part_id,
        partNameRaw: row.part_name_raw,
        techRaw: row.tech_raw,
        logRaw: row.log_raw,
        replacementRaw: row.replacement_raw,
        matchType: selected.matchType,
        basePrice: prices.base,
        middlePrice: prices.middle,
        finalPrice: prices.final,
        currencyUnit: 'UNKNOWN',
        suffix01Rank: row.suffix01_rank,
        family: { root: row.family_root, variant: row.family_variant, verified: false },
        modelCount: row.model_count,
        aliasCount: row.alias_count,
        replacementCount: row.replacement_count,
      },
      matchRank: selected.rank,
      nameSortRank: row.name_sort_rank,
      techSortRank: row.tech_sort_rank,
      sourceRowOrdinal: row.source_row_ordinal,
    });
  }
  const filteredScored = scored.filter((entry) =>
    (request.familyRoot === undefined || entry.item.family.root === request.familyRoot) &&
    (request.partId === undefined || entry.item.partId === request.partId));
  filteredScored.sort((left, right) => compareTuples(tupleFor(left), tupleFor(right)));

  const totalMatchedEntries = filteredScored.length;
  let pageItems: SearchItem[];
  let totalMatchedFamilies: number | undefined;
  let totalMatchedVariants: number | undefined;
  let nextCursor: string | null;
  if (request.groupBy === 'variant') {
    // Group already-ranked matching children, then hydrate only this bounded page.
    const variants = new Map<number, ScoredEntry[]>();
    for (const entry of filteredScored) {
      const rows = variants.get(entry.item.partId) ?? [];
      rows.push(entry); variants.set(entry.item.partId, rows);
    }
    const rows = [...variants.values()];
    totalMatchedVariants = rows.length;
    const afterIndex = after ? rows.findIndex(group => compareTuples(tupleFor(group[0]!), after) > 0) : 0;
    const start = afterIndex < 0 ? rows.length : afterIndex;
    const visible = rows.slice(start, start + request.limit);
    pageItems = visible.map(group => ({ type: 'variant', partId: group[0]!.item.partId,
      techRaw: group[0]!.item.techRaw, partNameRaw: group[0]!.item.partNameRaw, matchedEntryCount: group.length }));
    nextCursor = start + visible.length < rows.length && visible.length
      ? cursorFor(request.catalogVersion, fingerprint, tupleFor(visible[visible.length - 1]![0]!)) : null;
  } else if (request.groupBy === 'family') {
    const families = new Map<string, ScoredEntry[]>();
    for (const entry of filteredScored) {
      const root = entry.item.family.root;
      const group = families.get(root) ?? [];
      group.push(entry);
      families.set(root, group);
    }
    const familyRows = [...families.entries()].map(([root, children]) => ({ root, children, representative: children[0] as ScoredEntry }));
    familyRows.sort((left, right) => compareTuples(tupleFor(left.representative), tupleFor(right.representative)));
    totalMatchedFamilies = familyRows.length;
    const afterIndex = after ? familyRows.findIndex((family) => compareTuples(tupleFor(family.representative), after) > 0) : 0;
    const start = afterIndex < 0 ? familyRows.length : afterIndex;
    const visible = familyRows.slice(start, start + request.limit);
    pageItems = visible.map(({ root, children, representative }) => ({
      type: 'family',
      displayRoot: root,
      representative: representative.item,
      matchedEntryCount: children.length,
      variantCount: new Set(children.map((child) => child.item.partId)).size,
      verified: false,
    }));
    const hasMore = start + visible.length < familyRows.length;
    nextCursor = hasMore && visible.length
      ? cursorFor(request.catalogVersion, fingerprint, tupleFor(visible[visible.length - 1]!.representative))
      : null;
  } else {
    const afterIndex = after ? filteredScored.findIndex((entry) => compareTuples(tupleFor(entry), after) > 0) : 0;
    const start = afterIndex < 0 ? filteredScored.length : afterIndex;
    const visible = filteredScored.slice(start, start + request.limit);
    pageItems = visible.map((entry) => entry.item);
    const hasMore = start + visible.length < filteredScored.length;
    nextCursor = hasMore && visible.length
      ? cursorFor(request.catalogVersion, fingerprint, tupleFor(visible[visible.length - 1] as ScoredEntry))
      : null;
  }

  return {
    catalogVersion: request.catalogVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    items: pageItems,
    totalMatchedEntries,
    ...(totalMatchedFamilies !== undefined ? { totalMatchedFamilies } : {}),
    ...(totalMatchedVariants !== undefined ? { totalMatchedVariants } : {}),
    nextCursor,
  };
}

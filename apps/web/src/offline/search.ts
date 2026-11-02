import Dexie from 'dexie';
import { calculatePrices, normalizeCode, normalizeText, splitSearchTerms } from '@partsfinder/domain';
import type { EntryDetail, EntrySummary, FamilySummary, MatchType, VariantSummary, SearchPage, SearchRequest, VehicleOption } from '@partsfinder/contracts';
import { activeCatalogueVersion, catalogueReplica, type SearchDocumentRecord, type VersionedRecord } from './database.js';

const NORMALIZATION_VERSION = 1;
const RANKING_VERSION = 1;
type DocumentKind = SearchDocumentRecord['kind'];
type CodeKind = 'tech' | 'log' | 'replacement';

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

interface CompactCandidate {
  entryId: number;
  partId: number;
  matchRank: number;
  matchType: MatchType;
  nameLength: number;
  suffix01Rank: 0 | 1;
  basePrice: string;
  nameSortRank: number;
  techSortRank: number;
  sourceRowOrdinal: number;
  familyRoot: string;
  familyVariant: string;
}

interface CodeMatch { matchType: MatchType; rank: number; }
interface NameMatch { matchType: MatchType; rank: number; }

const MAX_CACHED_CANDIDATE_SETS = 3;
const MAX_CACHED_CANDIDATES_PER_QUERY = 12_000;
const candidateCache = new Map<string, CompactCandidate[]>();

function cachedCandidates(key: string): CompactCandidate[] | undefined {
  const cached = candidateCache.get(key);
  if (!cached) return undefined;
  candidateCache.delete(key);
  candidateCache.set(key, cached);
  return cached;
}

function rememberCandidates(key: string, candidates: CompactCandidate[]): void {
  if (candidates.length > MAX_CACHED_CANDIDATES_PER_QUERY) return;
  candidateCache.delete(key);
  candidateCache.set(key, candidates);
  while (candidateCache.size > MAX_CACHED_CANDIDATE_SETS) {
    const oldest = candidateCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    candidateCache.delete(oldest);
  }
}

function yieldWorker(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function codePoints(value: string): string[] {
  return [...value];
}

function trigrams(value: string): string[] {
  const points = codePoints(value);
  const grams = new Set<string>();
  for (let index = 0; index <= points.length - 3; index++) grams.add(points.slice(index, index + 3).join(''));
  return [...grams];
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search was cancelled.', 'AbortError');
}

function base64Encode(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64Decode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
}

function encodeCursor(payload: CursorPayload): string {
  return base64Encode(JSON.stringify(payload));
}

function decodeCursor(cursor: string | undefined, version: string, fingerprint: string): SortTuple | null {
  if (!cursor) return null;
  if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new TypeError('Cursor is malformed.');
  try {
    const payload = JSON.parse(base64Decode(cursor)) as CursorPayload;
    const tuple = payload.tuple;
    if (payload.version !== version || payload.fingerprint !== fingerprint || !tuple ||
      !Number.isInteger(tuple.matchRank) || !Number.isInteger(tuple.nameLength) ||
      ![0, 1].includes(tuple.suffix01Rank) || !/^(0|[1-9]\d*)$/.test(tuple.basePrice) ||
      !Number.isInteger(tuple.nameSortRank) || !Number.isInteger(tuple.techSortRank) ||
      !Number.isInteger(tuple.sourceRowOrdinal) || !Number.isSafeInteger(tuple.entryId)) throw new TypeError('Cursor does not match this version, query, or filter.');
    return tuple;
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError('Cursor is malformed.');
  }
}

async function fingerprint(request: SearchRequest, query: string): Promise<string> {
  const input = JSON.stringify({
    version: request.catalogVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    rankingVersion: RANKING_VERSION,
    mode: request.mode,
    kind: request.kind,
    query,
    vehicleOptionId: request.vehicleOptionId ?? null,
    familyRoot: request.familyRoot ?? null,
    partId: request.partId ?? null,
    groupBy: request.groupBy,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function compare(left: SortTuple, right: SortTuple): number {
  return left.matchRank - right.matchRank ||
    left.nameLength - right.nameLength ||
    left.suffix01Rank - right.suffix01Rank ||
    (BigInt(left.basePrice) > BigInt(right.basePrice) ? -1 : BigInt(left.basePrice) < BigInt(right.basePrice) ? 1 : 0) ||
    left.nameSortRank - right.nameSortRank ||
    left.techSortRank - right.techSortRank ||
    left.sourceRowOrdinal - right.sourceRowOrdinal ||
    left.entryId - right.entryId;
}

function tupleFor(candidate: CompactCandidate): SortTuple {
  return {
    matchRank: candidate.matchRank,
    nameLength: candidate.nameLength,
    suffix01Rank: candidate.suffix01Rank,
    basePrice: candidate.basePrice,
    nameSortRank: candidate.nameSortRank,
    techSortRank: candidate.techSortRank,
    sourceRowOrdinal: candidate.sourceRowOrdinal,
    entryId: candidate.entryId,
  };
}

async function docsFor(version: string, kinds: readonly DocumentKind[], value: string, signal?: AbortSignal): Promise<SearchDocumentRecord[]> {
  const found = new Map<number, SearchDocumentRecord>();
  for (const kind of kinds) {
    checkAbort(signal);
    if ([...value].length < 3) {
      let offset = 0;
      while (true) {
        checkAbort(signal);
        const rows = await catalogueReplica.searchDocuments
          .where('[version+kind+normalizedValue]')
          .between([version, kind, Dexie.minKey], [version, kind, Dexie.maxKey], true, true)
          .offset(offset)
          .limit(500)
          .toArray();
        if (!rows.length) break;
        for (const row of rows) if (row.normalizedValue.includes(value)) found.set(row.id, row);
        offset += rows.length;
        if (rows.length < 500) break;
        await yieldWorker();
      }
      continue;
    }

    const prefixRows = await catalogueReplica.searchDocuments
      .where('[version+kind+normalizedValue]')
      .between([version, kind, value], [version, kind, `${value}\uffff`], true, true)
      .toArray();
    for (const row of prefixRows) if (row.normalizedValue.includes(value)) found.set(row.id, row);

    let candidates: Map<number, SearchDocumentRecord> | null = null;
    for (const gram of trigrams(value)) {
      checkAbort(signal);
      const rows = await catalogueReplica.searchDocuments.where('gramKeys').equals(`${version}|${kind}|${gram}`).distinct().toArray();
      const current = new Map<number, SearchDocumentRecord>(rows.map((row): [number, SearchDocumentRecord] => [row.id, row]));
      if (candidates === null) candidates = current;
      else {
        const intersection = new Map<number, SearchDocumentRecord>();
        candidates.forEach((row, id) => { if (current.has(id)) intersection.set(id, row); });
        candidates = intersection;
      }
      if (!candidates.size) break;
      await yieldWorker();
    }
    for (const row of candidates?.values() ?? []) if (row.normalizedValue.includes(value)) found.set(row.id, row);
  }
  return [...found.values()];
}

async function documentsToEntries(version: string, documents: SearchDocumentRecord[], signal?: AbortSignal): Promise<Map<number, SearchDocumentRecord[]>> {
  const output = new Map<number, Map<number, SearchDocumentRecord>>();
  const docsById = new Map(documents.map((document) => [document.id, document]));
  const ids = [...docsById.keys()];
  for (let offset = 0; offset < ids.length; offset += 500) {
    checkAbort(signal);
    const chunk = ids.slice(offset, offset + 500);
    const postings = await catalogueReplica.entrySearchDocuments
      .where('[version+docId]')
      .anyOf(chunk.map((id) => [version, id]))
      .distinct()
      .toArray();
    for (const posting of postings) {
      const entryId = Number(posting.entryId);
      const docId = Number(posting.docId);
      const document = docsById.get(docId);
      if (!document) continue;
      const byDocument = output.get(entryId) ?? new Map<number, SearchDocumentRecord>();
      byDocument.set(docId, document);
      output.set(entryId, byDocument);
    }
    await yieldWorker();
  }
  return new Map([...output].map(([entryId, byDocument]) => [entryId, [...byDocument.values()]]));
}

function intersectEntrySets(sets: Set<number>[]): Set<number> {
  if (!sets.length) return new Set();
  sets.sort((a, b) => a.size - b.size);
  const first = sets[0];
  if (!first) return new Set();
  return new Set([...first].filter((id) => sets.every((set) => set.has(id))));
}

function codeMatch(kind: CodeKind, value: string, query: string): CodeMatch | null {
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

function evaluateNameMatch(documents: SearchDocumentRecord[], query: string, terms: string[]): NameMatch | null {
  const names = documents.filter((row) => row.kind === 'name');
  const aliases = documents.filter((row) => row.kind === 'alias');
  if (names.some((row) => row.normalizedValue === query)) return { matchType: 'nameExact', rank: 0 };
  if (aliases.some((row) => row.normalizedValue === query)) return { matchType: 'aliasExact', rank: 1 };
  if (names.some((row) => row.normalizedValue.startsWith(query))) return { matchType: 'namePrefix', rank: 2 };
  if (names.some((row) => row.normalizedValue.includes(query))) return { matchType: 'namePhrase', rank: 3 };
  if (aliases.some((row) => row.normalizedValue.includes(query))) return { matchType: 'aliasPhrase', rank: 4 };
  if (names.some((row) => terms.every((term) => row.normalizedValue.includes(term)))) return { matchType: 'nameTerms', rank: 5 };
  return documents.length ? { matchType: 'aliasTerms', rank: 6 } : null;
}

function overallRank(request: SearchRequest, path: 'code' | 'name', rank: number): number {
  if (request.kind !== 'auto') return rank;
  if (path === 'code') return rank <= 2 ? rank : 5 + rank;
  return rank <= 1 ? 3 + rank : 20 + rank;
}

function bestMatch(request: SearchRequest, code: CodeMatch | null, name: NameMatch | null): { matchType: MatchType; rank: number } | null {
  const matches: Array<{ matchType: MatchType; rank: number }> = [];
  if (code && request.kind !== 'name') matches.push({ matchType: code.matchType, rank: overallRank(request, 'code', code.rank) });
  if (name && request.kind !== 'code') matches.push({ matchType: name.matchType, rank: overallRank(request, 'name', name.rank) });
  matches.sort((left, right) => left.rank - right.rank);
  return matches[0] ?? null;
}

async function getVisibleSummary(version: string, candidate: CompactCandidate): Promise<EntrySummary> {
  const entry = await catalogueReplica.entries.get([version, candidate.entryId]);
  const part = await catalogueReplica.parts.get([version, candidate.partId]);
  if (!entry || !part) throw new Error('A visible search result disappeared from its pinned catalogue version.');
  const name = await catalogueReplica.partNames.get([version, Number(part.nameId)]);
  if (!name) throw new Error('A visible search result is missing its part name.');
  const [modelCount, aliasCount, replacementCount] = await Promise.all([
    catalogueReplica.entryModels.where('[version+entryId+ordinal]').between([version, candidate.entryId, Dexie.minKey], [version, candidate.entryId, Dexie.maxKey]).count(),
    catalogueReplica.aliases.where('[version+entryId+ordinal]').between([version, candidate.entryId, Dexie.minKey], [version, candidate.entryId, Dexie.maxKey]).count(),
    catalogueReplica.replacements.where('[version+entryId+ordinal]').between([version, candidate.entryId, Dexie.minKey], [version, candidate.entryId, Dexie.maxKey]).count(),
  ]);
  const release = await catalogueReplica.catalogVersions.get(version);
  if (!release) throw new Error('Pinned catalogue metadata is missing.');
  const prices = calculatePrices(String(entry.basePrice));
  return {
    type: 'entry', entryId: candidate.entryId, partId: candidate.partId,
    partNameRaw: String(name.nameRaw), techRaw: String(part.techRaw), logRaw: String(entry.logRaw),
    replacementRaw: String(entry.replacementRaw), matchType: candidate.matchType,
    basePrice: prices.base, middlePrice: prices.middle, finalPrice: prices.final,
    currencyUnit: release.currencyUnit, suffix01Rank: candidate.suffix01Rank,
    family: { root: candidate.familyRoot, variant: candidate.familyVariant, verified: false },
    modelCount, aliasCount, replacementCount,
  };
}

function validateSearch(request: SearchRequest): { query: string; codeQuery: string; terms: string[] } {
  if (!request || !/^[a-f0-9]{64}-s\d+-n\d+-r\d+$/.test(request.catalogVersion)) throw new TypeError('A valid pinned catalogue version is required.');
  if (request.mode !== 'global' && request.mode !== 'vehiclePart') throw new TypeError('Unsupported search mode.');
  if (request.kind !== 'auto' && request.kind !== 'code' && request.kind !== 'name') throw new TypeError('Unsupported search kind.');
  if (request.groupBy !== 'entry' && request.groupBy !== 'family' && request.groupBy !== 'variant') throw new TypeError('Unsupported result grouping.');
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) throw new TypeError('Limit must be from 1 to 100.');
  if ([...request.query].length > 128) throw new TypeError('Query must be at most 128 characters.');
  const query = normalizeText(request.query);
  if (!query) throw new TypeError('Enter a search term.');
  const terms = splitSearchTerms(query);
  if (!terms.length || terms.length > 8) throw new TypeError('Query must contain from 1 to 8 non-empty terms.');
  if (request.mode === 'vehiclePart' && (!Number.isSafeInteger(request.vehicleOptionId) || (request.vehicleOptionId ?? 0) <= 0)) {
    throw new TypeError('A valid vehicle option is required for vehicle-part search.');
  }
  return { query, codeQuery: normalizeCode(request.query), terms };
}

async function vehicleEntryIds(version: string, optionId: number): Promise<Set<number>> {
  const option = await catalogueReplica.vehicleOptions.get([version, optionId]);
  if (!option) throw new TypeError('The selected vehicle option does not exist in this catalogue version.');
  const optionModels = await catalogueReplica.optionModels
    .where('[version+optionId+ordinal]')
    .between([version, optionId, Dexie.minKey], [version, optionId, Dexie.maxKey])
    .toArray();
  const output = new Set<number>();
  for (const relation of optionModels) {
    const rows = await catalogueReplica.entryModels
      .where('[version+modelId+entryId]')
      .between([version, Number(relation.modelId), Dexie.minKey], [version, Number(relation.modelId), Dexie.maxKey])
      .toArray();
    for (const row of rows) output.add(Number(row.entryId));
    await yieldWorker();
  }
  return output;
}

export async function searchOffline(request: SearchRequest, signal?: AbortSignal): Promise<SearchPage> {
  const validated = validateSearch(request);
  checkAbort(signal);
  const release = await catalogueReplica.catalogVersions.get(request.catalogVersion);
  if (!release || release.status !== 'ready') throw new TypeError('This offline catalogue version is not ready.');
  const currentActive = await activeCatalogueVersion();
  if (currentActive !== request.catalogVersion) throw new TypeError('The active offline catalogue changed; restart this search.');
  const fingerprintValue = await fingerprint(request, validated.query);
  const after = decodeCursor(request.cursor, request.catalogVersion, fingerprintValue);
  let scoped = cachedCandidates(fingerprintValue);
  if (!scoped) {
    const codeEnabled = request.mode === 'global' && request.kind !== 'name';
    const nameEnabled = request.kind !== 'code';
    let codeDocumentsByEntry = new Map<number, SearchDocumentRecord[]>();
    if (codeEnabled && validated.codeQuery) {
      const documents = await docsFor(request.catalogVersion, ['tech', 'log', 'replacement'], validated.codeQuery, signal);
      codeDocumentsByEntry = await documentsToEntries(request.catalogVersion, documents, signal);
    }

    const nameDocumentsByEntry = new Map<number, SearchDocumentRecord[]>();
    let nameEntryIds = new Set<number>();
    if (nameEnabled) {
      const termSets: Set<number>[] = [];
      for (const term of validated.terms) {
        checkAbort(signal);
        const documents = await docsFor(request.catalogVersion, ['name', 'alias'], term, signal);
        const associations = await documentsToEntries(request.catalogVersion, documents, signal);
        termSets.push(new Set(associations.keys()));
        for (const [entryId, rows] of associations) {
          const existing = new Map((nameDocumentsByEntry.get(entryId) ?? []).map((row) => [row.id, row]));
          for (const row of rows) existing.set(row.id, row);
          nameDocumentsByEntry.set(entryId, [...existing.values()]);
        }
        await yieldWorker();
      }
      nameEntryIds = intersectEntrySets(termSets);
    }

    const candidates = new Set([...codeDocumentsByEntry.keys(), ...nameEntryIds]);
    if (request.mode === 'vehiclePart') {
      const allowed = await vehicleEntryIds(request.catalogVersion, request.vehicleOptionId as number);
      for (const id of candidates) if (!allowed.has(id)) candidates.delete(id);
    }

    const candidateIds = [...candidates];
    const compact: CompactCandidate[] = [];
    for (let offset = 0; offset < candidateIds.length; offset += 500) {
      checkAbort(signal);
      const ids = candidateIds.slice(offset, offset + 500);
      const entryRows = await catalogueReplica.entries.bulkGet(ids.map((id) => [request.catalogVersion, id] as [string, number]));
      const entries = entryRows.filter((row): row is VersionedRecord => Boolean(row));
      const partIds = [...new Set(entries.map((row) => Number(row.partId)))];
      const partRows = await catalogueReplica.parts.bulkGet(partIds.map((id) => [request.catalogVersion, id] as [string, number]));
      const parts = new Map(partRows.filter((row): row is VersionedRecord => Boolean(row)).map((row) => [Number(row.id), row]));
      const nameIds = [...new Set([...parts.values()].map((row) => Number(row.nameId)))];
      const nameRows = await catalogueReplica.partNames.bulkGet(nameIds.map((id) => [request.catalogVersion, id] as [string, number]));
      const names = new Map(nameRows.filter((row): row is VersionedRecord => Boolean(row)).map((row) => [Number(row.id), row]));
      for (const entry of entries) {
        const entryId = Number(entry.id);
        const partId = Number(entry.partId);
        const part = parts.get(partId);
        const name = part ? names.get(Number(part.nameId)) : undefined;
        if (!part || !name) continue;
        const codeDocs = codeDocumentsByEntry.get(entryId) ?? [];
        const codeMatches = codeDocs.flatMap((row) => row.kind === 'tech' || row.kind === 'log' || row.kind === 'replacement'
          ? [codeMatch(row.kind as CodeKind, row.normalizedValue, validated.codeQuery)].filter((value): value is CodeMatch => value !== null)
          : []);
        codeMatches.sort((left, right) => left.rank - right.rank);
        const nameHit = nameEntryIds.has(entryId) ? evaluateNameMatch(nameDocumentsByEntry.get(entryId) ?? [], validated.query, validated.terms) : null;
        const matched = bestMatch(request, codeMatches[0] ?? null, nameHit);
        if (!matched) continue;
        compact.push({
          entryId,
          partId,
          matchRank: matched.rank,
          matchType: matched.matchType,
          nameLength: codePoints(String(name.nameRaw)).length,
          suffix01Rank: Number(entry.suffix01Rank) === 0 ? 0 : 1,
          basePrice: String(entry.basePrice),
          nameSortRank: Number(name.sortRank),
          techSortRank: Number(part.sortRank),
          sourceRowOrdinal: Number(entry.sourceRowOrdinal),
          familyRoot: String(part.familyRoot),
          familyVariant: String(part.familyVariant),
        });
      }
      await yieldWorker();
    }

    scoped = compact.filter((candidate) =>
      (request.familyRoot === undefined || candidate.familyRoot === request.familyRoot) &&
      (request.partId === undefined || candidate.partId === request.partId));
    scoped.sort((left, right) => compare(tupleFor(left), tupleFor(right)));
    rememberCandidates(fingerprintValue, scoped);
  }
  const totalMatchedEntries = scoped.length;

  if (request.groupBy === 'variant') {
    const variants = new Map<number, CompactCandidate[]>();
    for (const candidate of scoped) {
      const rows = variants.get(candidate.partId) ?? [];
      rows.push(candidate); variants.set(candidate.partId, rows);
    }
    const rows = [...variants.values()];
    const afterIndex = after ? rows.findIndex(group => compare(tupleFor(group[0]!), after) > 0) : 0;
    const from = afterIndex < 0 ? rows.length : afterIndex;
    const visible = rows.slice(from, from + request.limit);
    const items: VariantSummary[] = await Promise.all(visible.map(async group => {
      const representative = await getVisibleSummary(request.catalogVersion, group[0]!);
      return { type: 'variant', partId: representative.partId, techRaw: representative.techRaw,
        partNameRaw: representative.partNameRaw, matchedEntryCount: group.length };
    }));
    const last = visible[visible.length - 1]?.[0];
    return { catalogVersion: request.catalogVersion, normalizationVersion: release.normalizationVersion,
      items, totalMatchedEntries, totalMatchedVariants: rows.length,
      nextCursor: from + visible.length < rows.length && last
        ? encodeCursor({ version: request.catalogVersion, fingerprint: fingerprintValue, tuple: tupleFor(last) }) : null };
  }
  if (request.groupBy === 'family') {
    const groups = new Map<string, CompactCandidate[]>();
    for (const candidate of scoped) {
      const values = groups.get(candidate.familyRoot) ?? [];
      values.push(candidate);
      groups.set(candidate.familyRoot, values);
    }
    const familyRows = [...groups.entries()].map(([root, rows]) => ({ root, rows, representative: rows[0] as CompactCandidate }));
    familyRows.sort((left, right) => compare(tupleFor(left.representative), tupleFor(right.representative)));
    const totalMatchedFamilies = familyRows.length;
    const start = after ? familyRows.findIndex((family) => compare(tupleFor(family.representative), after) > 0) : 0;
    const from = start < 0 ? familyRows.length : start;
    const visible = familyRows.slice(from, from + request.limit);
    const items: FamilySummary[] = await Promise.all(visible.map(async ({ root, rows, representative }) => ({
      type: 'family',
      displayRoot: root,
      representative: await getVisibleSummary(request.catalogVersion, representative),
      matchedEntryCount: rows.length,
      variantCount: new Set(rows.map((row) => row.partId)).size,
      verified: false,
    })));
    const hasMore = from + visible.length < familyRows.length;
    const last = visible[visible.length - 1]?.representative;
    return {
      catalogVersion: request.catalogVersion,
      normalizationVersion: release.normalizationVersion,
      items,
      totalMatchedEntries,
      totalMatchedFamilies,
      nextCursor: hasMore && last ? encodeCursor({ version: request.catalogVersion, fingerprint: fingerprintValue, tuple: tupleFor(last) }) : null,
    };
  }

  const start = after ? scoped.findIndex((candidate) => compare(tupleFor(candidate), after) > 0) : 0;
  const from = start < 0 ? scoped.length : start;
  const visible = scoped.slice(from, from + request.limit);
  const items = await Promise.all(visible.map((candidate) => getVisibleSummary(request.catalogVersion, candidate)));
  const hasMore = from + visible.length < scoped.length;
  const last = visible[visible.length - 1];
  return {
    catalogVersion: request.catalogVersion,
    normalizationVersion: release.normalizationVersion,
    items,
    totalMatchedEntries,
    nextCursor: hasMore && last ? encodeCursor({ version: request.catalogVersion, fingerprint: fingerprintValue, tuple: tupleFor(last) }) : null,
  };
}

export async function getOfflineEntryDetail(version: string, entryId: number): Promise<EntryDetail> {
  const active = await activeCatalogueVersion();
  if (active !== version) throw new TypeError('The active offline catalogue changed; reopen this entry.');
  const summaryRow = await catalogueReplica.entries.get([version, entryId]);
  if (!summaryRow) throw new TypeError('Catalogue entry was not found.');
  const part = await catalogueReplica.parts.get([version, Number(summaryRow.partId)]);
  const name = part ? await catalogueReplica.partNames.get([version, Number(part.nameId)]) : undefined;
  const release = await catalogueReplica.catalogVersions.get(version);
  if (!part || !name || !release) throw new Error('Catalogue entry relationships are incomplete.');
  const [models, friendly, aliases, replacements] = await Promise.all([
    catalogueReplica.entryModels.where('[version+entryId+ordinal]').between([version, entryId, Dexie.minKey], [version, entryId, Dexie.maxKey]).sortBy('ordinal'),
    catalogueReplica.friendlyLabels.where('[version+entryId+ordinal]').between([version, entryId, Dexie.minKey], [version, entryId, Dexie.maxKey]).sortBy('ordinal'),
    catalogueReplica.aliases.where('[version+entryId+ordinal]').between([version, entryId, Dexie.minKey], [version, entryId, Dexie.maxKey]).sortBy('ordinal'),
    catalogueReplica.replacements.where('[version+entryId+ordinal]').between([version, entryId, Dexie.minKey], [version, entryId, Dexie.maxKey]).sortBy('ordinal'),
  ]);
  const modelRows = await Promise.all(models.map((row) => catalogueReplica.models.get([version, Number(row.modelId)])));
  const targetTechs = await Promise.all(replacements.map(async (row) => {
    const target = row.targetPartId === null ? undefined : await catalogueReplica.parts.get([version, Number(row.targetPartId)]);
    return { raw: String(row.tokenRaw), targetTechRaw: target ? String(target.techRaw) : null };
  }));
  const prices = calculatePrices(String(summaryRow.basePrice));
  return {
    type: 'entry',
    entryId,
    partId: Number(summaryRow.partId),
    partNameRaw: String(name.nameRaw),
    techRaw: String(part.techRaw),
    logRaw: String(summaryRow.logRaw),
    replacementRaw: String(summaryRow.replacementRaw),
    basePrice: prices.base,
    middlePrice: prices.middle,
    finalPrice: prices.final,
    currencyUnit: release.currencyUnit,
    suffix01Rank: Number(summaryRow.suffix01Rank) === 0 ? 0 : 1,
    family: { root: String(part.familyRoot), variant: String(part.familyVariant), verified: false },
    modelCount: models.length,
    aliasCount: aliases.length,
    replacementCount: replacements.length,
    sourceRowOrdinal: Number(summaryRow.sourceRowOrdinal),
    models: modelRows.flatMap((row) => row ? [String(row.nameRaw)] : []),
    friendlyLabels: friendly.map((row) => String(row.labelRaw)),
    aliases: aliases.map((row) => String(row.aliasRaw)),
    replacementTokens: targetTechs,
  };
}

export async function listOfflineVehicleOptions(version: string, query = '', limit = 80): Promise<VehicleOption[]> {
  const active = await activeCatalogueVersion();
  if (active !== version) throw new TypeError('The active offline catalogue changed; reload vehicle options.');
  const normalizedQuery = normalizeText(query);
  const allOptions = await catalogueReplica.vehicleOptions.where('version').equals(version).sortBy('displayOrder');
  const rows = allOptions.filter((row) => !normalizedQuery ||
    String(row.labelNorm).includes(normalizedQuery) || String(row.keywordsNorm).includes(normalizedQuery)).slice(0, limit);
  const result = rows.map(async (row) => {
    const memberships = await catalogueReplica.optionModels.where('[version+optionId+ordinal]')
      .between([version, Number(row.id), Dexie.minKey], [version, Number(row.id), Dexie.maxKey]).sortBy('ordinal');
    const models = await Promise.all(memberships.map((membership) => catalogueReplica.models.get([version, Number(membership.modelId)])));
    return {
      id: Number(row.id), kind: String(row.kind) as 'main' | 'other', labelRaw: String(row.labelRaw),
      keywordsRaw: String(row.keywordsRaw), displayOrder: Number(row.displayOrder),
      models: models.flatMap((model) => model ? [String(model.nameRaw)] : []),
    } satisfies VehicleOption;
  });
  return Promise.all(result);
}

export async function listOfflinePresets(version: string): Promise<Array<{ key: string; label: string; options: VehicleOption[] }>> {
  const active = await activeCatalogueVersion();
  if (active !== version) throw new TypeError('The active offline catalogue changed; reload vehicle presets.');
  const families = await catalogueReplica.presetFamilies.where('version').equals(version).sortBy('displayOrder');
  return Promise.all(families.map(async (family) => {
    const familyKey = String(family.familyKey);
    const relations = await catalogueReplica.presetFamilyOptions
      .where('[version+familyKey+optionId]')
      .between([version, familyKey, Dexie.minKey], [version, familyKey, Dexie.maxKey])
      .sortBy('displayOrder');
    const options = await Promise.all(relations.map(async (relation) => {
      const option = await catalogueReplica.vehicleOptions.get([version, Number(relation.optionId)]);
      if (!option) return null;
      const memberships = await catalogueReplica.optionModels
        .where('[version+optionId+ordinal]')
        .between([version, Number(option.id), Dexie.minKey], [version, Number(option.id), Dexie.maxKey])
        .sortBy('ordinal');
      const models = await Promise.all(memberships.map((membership) => catalogueReplica.models.get([version, Number(membership.modelId)])));
      return {
        id: Number(option.id), kind: String(option.kind) as 'main' | 'other', labelRaw: String(option.labelRaw),
        keywordsRaw: String(option.keywordsRaw), displayOrder: Number(option.displayOrder),
        models: models.flatMap((model) => model ? [String(model.nameRaw)] : []),
      } satisfies VehicleOption;
    }));
    return { key: familyKey, label: String(family.labelRaw), options: options.filter((option): option is VehicleOption => option !== null) };
  }));
}

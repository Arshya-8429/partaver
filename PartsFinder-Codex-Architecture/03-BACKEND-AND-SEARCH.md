# Backend API and search contract

## 1. Service structure

Implement a modular Fastify server, not a generic CRUD scaffold. Routes validate inputs and serialize outputs; services enforce version and query rules; repositories execute parameterized SQL. JSON schemas are application-controlled, never supplied by catalogue data. Publish an OpenAPI description matching the implemented contracts.

Use one dedicated database Worker thread for catalogue searches initially, with a bounded queue and one SQLite connection owned by that worker. `better-sqlite3` is synchronous: do not move a whole-catalogue query onto the HTTP event loop and call it asynchronous. Short health/config handlers stay on the event loop. The import CLI runs separately and writes only staging versions. Keep a single publication writer.

Return 503 on queue overload instead of unbounded memory growth. A cancelled request's result must be discarded. It is acceptable that a synchronous SQL statement finishes before cancellation is observed; do not claim hard cancellation without implementing and testing it. Read-only search connections must not publish/import data.

## 2. Shared interfaces

All fields below are a contract, not an assertion these functions already exist.

```typescript
type Money = string; // non-negative decimal integer, no separators

type SearchRequest = {
  catalogVersion: string;
  mode: 'vehiclePart' | 'global';
  kind: 'auto' | 'code' | 'name';
  query: string;
  vehicleOptionId?: number;
  groupBy: 'entry' | 'family';
  limit: number;
  cursor?: string;
};

type SearchPage = {
  catalogVersion: string;
  normalizationVersion: number;
  items: SearchItem[];
  totalMatchedEntries: number;
  totalMatchedFamilies?: number;
  nextCursor: string | null;
};

interface CatalogueRepository {
  getManifest(signal?: AbortSignal): Promise<CatalogueManifest>;
  search(input: SearchRequest, signal?: AbortSignal): Promise<SearchPage>;
  getEntry(version: string, entryId: number, signal?: AbortSignal): Promise<EntryDetail>;
  listVehicleOptions(version: string, query: string, limit: number): Promise<VehicleOption[]>;
  suggestPartNames(version: string, optionId: number, query: string, limit: number): Promise<string[]>;
}
```

`SearchItem` is a discriminated union of entry-summary and family-summary. An entry contains entry/part IDs, original name/codes, match type, source base price and the two derived prices, currency unit, suffix priority, family display metadata and model/alias/replacement COUNTS. `EntryDetail` adds the correctly scoped original relationships. A family summary contains a display root, representative entry, matched-entry/variant counts, a family query cursor and `verified=false` for legacy-derived grouping. Define all these concrete schemas in `packages/contracts`; do not return arbitrary database objects.

## 3. HTTP routes

| Method/path | Contract |
|---|---|
| `GET /health/live` | Process is alive; no catalogue or private paths in response |
| `GET /health/ready` | DB reachable, active catalogue ready; 503 otherwise |
| `GET /api/v1/catalog/manifest` | Active version, counts, schema/rules/normalizer versions, currency, dates, snapshot-manifest path; ETag |
| `GET /api/v1/catalog/:version/manifest` | Same metadata for a retained explicit version |
| `GET /api/v1/vehicles` | `version`, `q`, `limit` (default 20, max 80), optional main/other filter |
| `GET /api/v1/presets` | Version-pinned family/options metadata only |
| `GET /api/v1/parts/suggestions` | `version`, `vehicleOptionId`, `q`, `limit` (default 20, max 80) |
| `GET /api/v1/search` | SearchRequest, with `version` mapped to `catalogVersion`; default limit 20, maximum 100 |
| `GET /api/v1/entries/:id` | Required `version`; full details for ONE source entry |
| `GET /api/v1/families/:root/variants` | Required `version` and original search context; default 10 variants, max 50; bounded children |
| `GET /api/v1/parts/:id/entries` | Required `version`; default 10 logistics entries, max 50 |
| `GET /api/v1/catalog/:version/snapshot/manifest` | Ordered chunks, schemas, byte sizes, hashes and per-table counts |
| `GET /api/v1/catalog/:version/snapshot/chunks/:chunkId` | One immutable bounded chunk; known IDs only, no arbitrary file paths |

No `/all-parts` endpoint is called at startup. No open upload/import/delete endpoint. Imports, publication and rollback are CLI operations. Snapshot endpoints are subject to exactly the same access policy as search; do not expose a private catalogue through a public static directory.

Input query maximum is 128 Unicode code points and 8 non-empty terms. Reject invalid limits/cursors, absent vehicle for `vehiclePart`, unsupported modes and malformed identifiers with stable 400 errors. Empty search returns a validation message, not 36k records. Literal `%`, `_`, quotes and FTS operators must not become executable SQL/FTS syntax. Unknown current version returns `CATALOG_VERSION_UNAVAILABLE` (409) and the current manifest location; unknown entry within a valid version returns 404.

Cursor contents include version, normalizer/ranking version, query/filter fingerprint, grouping and the last complete sort tuple. Decode with size/schema limits and use bound SQL values. Never accept column names or SQL from a cursor. Finish all statements for one request against the same pinned immutable version. Publication between pages must not create missing or duplicate records.

## 4. Normalization and matching

Start from the exact source `norm()` and `normCode()` transformations, with shared tests: Persian/Arabic Yeh and Kaf, the existing Teh-Marbuta rule, Persian and Arabic-Indic digits, NBSP, ZWNJ, tatweel, whitespace, lowercase, underscores in code input and en/em dashes. Do not strip meaningful hyphens, leading zeroes or suffixes. Never write normalized values back over raw source codes/names.

`vehiclePart` resolves an explicit option to the raw model memberships, then matches ALL input name terms across the part name/aliases as the source does. A family name alone must not automatically select the first trim. Ambiguous vehicle input keeps the picker open.

`global/auto` searches code fields AND names/aliases. This deliberately replaces the brittle digit-only/raw-Persian heuristic, so Persian-digit codes and names such as `sensor 2` do not disappear. Keep the existing two-tab UI; an extra filter is not required. `global/code` and `global/name` are explicit API capabilities for deterministic tests. Deduplicate a record appearing through multiple match paths by entry ID, not technical code.

Code matching evaluates technical code, logistics code and EACH replacement token separately. Do not concatenate them into one string and permit a match that crosses a field boundary. Code-family roots are not a substitute for exact/prefix/infix code matching.

## 5. Indexed candidates, then verified ranking

Server pipeline:

1. Resolve the version and optional model-entry set using indexes.
2. For code queries, check B-tree exact and prefix candidates first. Use FTS5 trigram for infix candidates at length >= 3.
3. For name/alias queries, find dictionary search documents for each term; resolve their entry IDs and intersect per-term entry sets. Different terms may occur in different aliases of the SAME entry.
4. Verify candidates with shared normalized matching logic before scoring. Trigrams are a candidate accelerator, not proof of an exact phrase.
5. Compute relevance and stable sort tuples; paginate summaries. Fetch full details only for requested visible results.

Use FTS5 trigram with normalized strings and literal escaped query expressions. Do not use English stemming, `porter`, or ordinary word-only FTS as a replacement for existing Persian substring behaviour. FTS5 trigram does not match strings shorter than 3 Unicode characters; 1-2 character input needs a deliberate exact/prefix lookup and, where infix is required, a bounded iterator scan in the database worker. A short query must not falsely report zero because the index cannot represent it.

Common broad queries can produce many genuine matches. Reading compact candidate IDs to compute exact counts is acceptable; constructing all full result objects or HTML is not. Iterate chunks, yield between search stages, and document memory/latency. Never truncate candidates and label the resulting count as the full total.

## 6. Deterministic ordering

For code-only hits preserve relevance order: exact technical, exact logistics, exact replacement, technical prefix, logistics prefix, replacement prefix, technical infix, logistics infix, replacement infix.

For name-only hits preserve source priority: exact name, exact alias, name prefix, name phrase, alias phrase, all terms in name, all terms across name and aliases. Preserve the source extra-name-length tie-break, then terminal `-01`, descending base price, name and technical-code order.

For auto search, exact technical/logistics/replacement hits come first; exact-name and exact-alias hits follow, then remaining code hits in their code ordering, then remaining name hits in their name ordering. Assign the best match type to an entry that appears through both paths. This is an explicitly authorized search correction, not a data migration change.

Persist deterministic name/technical-code sort ranks at publication and export them. SQL collation and different browser ICU versions must not produce inconsistent page boundaries. Finish equal tuples with source-row ordinal/entry ID. Use numeric money comparison, not lexicographic comparison of decimal strings.

Family grouping uses the BEST MATCHED child sort tuple for its top-level position; an expensive unrelated suffix must not hide the actual exact match. Paginate FAMILIES first for family views, not arbitrary rows that split one family across pages. Within a family, show matching variants and entries first. Loading nonmatching siblings requires an explicit, labelled "all variants" action, with totals distinguished from matched counts.

Legacy code families remain labelled as heuristic display groups. Every variant keeps its own name, code, price and entry-scoped fitment. A family header does not certify that its members are the same part. Display friendly labels followed by raw model labels using the existing canonical/dedup display logic, but vehicle filtering uses raw model memberships only.

## 7. Security and operational limits

Parameterize SQL; reject unsafe file paths; use response schemas to avoid disclosing raw archives, reports or secrets. Load application-controlled schemas only. Use request IDs, sanitized errors and bounded query logging; avoid logging the complete catalogue, secret tokens or full source uploads. Configure trusted proxies narrowly.

Select the newest patched SQLite engine compatible with the chosen supported driver at implementation time, record its runtime version, and review upstream WAL/security notices. Do not pin an old SQLite build merely because an example uses it. Set a finite busy timeout, use WAL on local persistent storage and treat long imports as staging jobs rather than HTTP transactions.

This scope is read-only for browser clients. The production access boundary and offline confidentiality limits are in document 01. Do not claim an API key embedded in JS makes catalogue access private.

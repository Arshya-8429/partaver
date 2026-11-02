# PartsFinder: complete Codex migration specification

Prepared 2026-10-20. Design and handoff documents only; original HTML unchanged.



---

<!-- Document: 00-START-HERE.md -->

# PartsFinder - Codex implementation handoff

This pack is based on the supplied HTML and read-only data extraction. It is a specification and task plan, NOT an already migrated application. The original HTML remains unchanged. There is no migrated production DB or backend binary inside this pack.

## What to give Codex

Keep the existing `PartsFinder_Android-28 (1) (1).html` in the workspace. Add this folder, or provide the combined `PartsFinder-Codex-Migration-Plan.md`, which contains the same documents and baseline JSON appendices.

Read order: architecture -> database/migration -> backend/search -> frontend/offline -> implementation plan -> verification/operations. Source notes distinguish observed facts from proposed decisions. Do not omit the migration rules and implement only a generic backend scaffold.

## Execution prompt

```text
Refactor the existing PartsFinder application in this workspace using the
attached PartsFinder-Codex-Migration-Plan.md (or the complete extracted
PartsFinder-Codex-Architecture folder) as the implementation specification.

The original application is PartsFinder_Android-28 (1) (1).html. Locate it
and inspect any existing project structure first. Preserve the original
file and all existing user work. Do not execute its scripts to import data.

This is an implementation task, not a request for another architecture
proposal. Implement the specification sequentially and deliver working
code, an actual migrated SQLite catalogue, and test/migration reports.

Use a modular TypeScript/Vite frontend preserving the current Persian RTL
UI, a Node.js/Fastify backend with SQLite, and a Dexie/IndexedDB offline
replica searched through a dedicated Web Worker. Do not add unnecessary
frameworks, microservices, Redis, Elasticsearch, accounts panels or a
native Android rewrite. No public deployment is authorized.

The critical migration rules are non-negotiable:
- Preserve every source row and all source metadata.
- Technical codes and logistics codes are different identities.
- Preserve each logistics entry's own price, models, friendly labels,
  aliases and replacement data; never union sibling fitment blindly.
- Preserve original raw strings and leading zeroes. Normalize only
  additional search fields.
- Preserve source prices without guessing Rial/Toman or effective dates.
- Both 10% and 20% prices derive from base with tested integer rounding.
- Keep the existing Tiggo 7 Pro Max AWD naming projection and -01 ranking.
- Code-family grouping is display-only, never a data merge or fitment rule.

Do not put the full catalogue in HTML, JS, or the initial bundle. Do not
load all database rows into the main browser thread at startup. Implement
indexed searches, bounded result pages, lazy details, and a real offline
install/update pipeline with atomic activation and rollback protection.

For this exact source hash, reconcile 36,569 rows, 31,509 technical codes,
36,569 logistics codes, 119 raw models, and every original row field. If
the source differs, regenerate the baseline and report the difference.
Matching counts alone are insufficient: verify full field-level hashes.

Follow 05-IMPLEMENTATION-PLAN.md task by task (or its corresponding section
in the combined document). Write regression tests before behaviour changes,
run the real commands, and record evidence. Preserve the working version
when import, update, network or quota handling fails. Do not claim a pass,
migration, offline support, performance improvement or APK without proof.

Finish with the runnable project, migrated database, exact verification
results, before/after measurements, run/update/backup/rollback instructions,
and a clear list of untested environments or blockers. Do not stop at
an empty schema, mock API, TODO-only offline implementation or a plan.
```

## Pack contents

| File | Purpose |
|---|---|
| `01-ARCHITECTURE.md` | Stack decision, boundaries, source facts and folder structure |
| `02-DATABASE-AND-MIGRATION.md` | Tables, field mappings, safe extraction and lossless reconciliation |
| `03-BACKEND-AND-SEARCH.md` | Repository/API contracts, indexes, search ranking and paging |
| `04-FRONTEND-AND-OFFLINE.md` | Worker/IndexedDB structure, staged updates and bounded UI |
| `05-IMPLEMENTATION-PLAN.md` | Seven independently testable implementation tasks |
| `06-VERIFICATION-AND-OPERATIONS.md` | Acceptance tests, target budgets, backup and deployment limits |
| `07-SOURCE-NOTES.md` | Source provenance, references and untested conditions |
| `baseline/source-inventory.json` | Measured source counts, values and SHA |
| `baseline/migration-fixtures.json` | Actual source rows for migration/search regression tests |

The full original 11.4 MB HTML is intentionally not duplicated in this pack.


---

<!-- Document: 01-ARCHITECTURE.md -->

# PartsFinder: lightweight offline-first architecture

**Status:** implementation specification for Codex, not an implemented migration.
**Source:** `PartsFinder_Android-28 (1) (1).html`.
**Scope:** preserve the current Persian Android/Chrome parts-finder UI and catalogue behaviour while separating data, UI, search, import and publication. Do not redesign the product or add a CRM, accounts panel, checkout or inventory system.

## 1. What the source actually contains

The original is a standalone HTML file with inline CSS, application scripts and a literal `const DB`. It is not an existing backend or an Android native project. The database contains `rows`, `parts`, `primary`, `others`, `groups`, and `primaryOptions`.

Measured by read-only extraction of the supplied file:

| Measurement | Value |
|---|---:|
| File bytes | 11,417,283 |
| Embedded DB literal bytes, UTF-8 | 11,354,916 |
| Share attributable to the DB literal | 99.4537% |
| Source rows / distinct logistics codes | 36,569 / 36,569 |
| Distinct technical codes | 31,509 |
| Distinct part-name strings | 13,045 |
| Distinct raw vehicle-model strings | 119 |
| Raw primary options / other options | 40 / 77 |
| Effective primary options after existing naming rule | 39 |
| Rows with no vehicle models | 1,809 |
| Technical codes with multiple prices | 3,750 |
| Technical codes whose logistics rows have different model arrays | 136 |
| Prices exceeding signed 32-bit integer capacity | 386 |

The 40 primary options are UI labels, not the complete vehicle-model universe. Preserve the existing `canonicalizeTiggo7ProMax()` transformation: map the old plain label into the AWD option, retaining BOTH underlying model memberships. Archive the unmodified source separately. Do not silently infer any additional AWD compatibility.

These are source/data observations, not measured runtime performance. The original price unit and price-effective date are absent; import time is not a substitute for a price date.

## 2. Selected approach and boundaries

**Default:** one modular backend application, one central SQLite database, and one read-only offline catalogue replica in the browser's IndexedDB.

| Layer | Decision |
|---|---|
| UI | Preserve existing HTML/CSS; extract into TypeScript modules built by Vite |
| Backend | Supported Node.js LTS + TypeScript + Fastify |
| Authoritative storage | SQLite, using `better-sqlite3`, versioned SQL migrations |
| Server search | B-tree exact/prefix indexes plus SQLite FTS5 trigram candidates |
| Offline storage | IndexedDB through Dexie; no Dexie Cloud dependency |
| Browser search | Dedicated Web Worker querying local indexes |
| App-shell offline support | Service Worker + manifest for HTTPS PWA |
| Import/publication | Local CLI with immutable release versions and validation |
| Testing | Vitest for logic, Fastify inject for API, Playwright for browser tests |

SQLite is selected for this read-mostly catalogue with controlled single-writer imports. The 36k row count does not require a standalone database server. Keep the DB file on the SAME machine/local persistent disk as the API. Do not place a WAL database on a network share or ephemeral/serverless filesystem. Move to PostgreSQL behind the repository interface only when a real requirement for multiple writer services, multiple API replicas, or deployment restrictions justifies it.

Alternatives considered: an IndexedDB-only application is lighter operationally but does not provide the requested central backend/update authority. An online-only API reduces local data storage but removes the existing offline capability. PostgreSQL is a valid future deployment choice, not a mandatory extra service today. Do not implement all three alternatives.

No Redis, Elasticsearch, microservices, SSR, heavy component library, SQLite-WASM in the browser or native Android rewrite is required for this scope.

## 3. Runtime flow

UI -> application service -> CatalogueRepository

* Installed catalogue: repository asks the search Worker, which queries IndexedDB and returns ONE result page.
* No installed catalogue, network available: HTTP repository returns bounded API results while the first local catalogue is prepared.
* No installed catalogue, offline: show an explicit first-install/import state. Never claim the application already has offline data.
* Update: obtain a version manifest, download independent chunks, validate and index into a staging version, atomically activate it, then refresh the visible query.

The backend is authoritative. Browsers do not edit catalogue data or synchronize writes back. This is snapshot replication, not multi-master synchronization. The API does NOT need to run on the phone for installed offline searches.

The Service Worker caches application assets, NOT an unbounded copy of every search response. The search Worker performs query/index work; these are different responsibilities.

## 4. Repository structure

Adapt to an existing equivalent structure if Codex finds one; do not overwrite user changes to force these names.

```text
partsfinder/
  apps/
    web/
      index.html
      public/manifest.webmanifest
      src/
        main.ts
        styles/{base,components,dark,motion}.css
        ui/{vehicle-picker,presets,search-form,result-list,code-family,status}.ts
        application/{catalogue-service,update-service}.ts
        data/{catalogue-repository,http-repository,indexeddb-repository}.ts
        workers/{search.worker,worker-client}.ts
        offline/{db,snapshot-importer,version-activation}.ts
        pwa/service-worker.ts
    api/
      src/
        server.ts
        config.ts
        modules/catalogue/{routes,service,repository,schemas}.ts
        modules/search/{routes,service,sqlite-search}.ts
        workers/{database.worker,worker-pool}.ts
        db/{connection,migrations}.ts
  packages/
    domain/src/{types,normalize,pricing,ranking,vehicle-rules,code-family}.ts
    contracts/src/{catalogue,search,snapshot,errors}.ts
    importer/src/{cli,extract-literal,validate,transform,import,publish,verify}.ts
  database/migrations/
  scripts/{verify-migration,export-snapshot,measure-bundle,benchmark}.ts
  tests/{unit,integration,e2e,fixtures}/
  docs/{architecture,migration-report,operations,performance}/
  private-data/                 # ignored by git, outside web root
    source-archive/
    sqlite/
    imports/
    snapshots/
    backups/
  package.json
  package-lock.json
  .env.example
```

Use npm workspaces unless the real repository already uses another package manager. One lockfile. Record verified dependency versions and supported Node engine at implementation time; do not use floating `latest` dependencies in the finished project. Import scripts and SQL drivers must never be bundled into the browser.

Dependencies point inward: UI -> application -> repository contract; adapters implement that contract. Shared `domain` modules contain deterministic logic with no DOM, database, HTTP, or Node-only imports.

## 5. Behaviour that must remain recognizable

Preserve the two search tabs, Persian RTL layout, model/trim picker, quick family drawer, partial part-name search, global code/name search without a vehicle, full technical/logistics codes, replacement codes, model display, dark/light preference, price levels and subtle touch feedback. Preserve source spelling in stored data, even when poor. Do not add product images that the source does not contain.

Use the original `partsFinderTheme` key where origin access permits it. A new origin cannot silently read old file-origin storage; fall back to system theme rather than claiming settings migrated.

Reuse the existing `-01` preference as a ranking rule, not a filter. Preserve the legacy rule that checks both `log` and `tech` for a terminal `-01`, unless a separately tested change is explicitly approved. Preserve higher base price as the existing subsequent tie-break, not as an assertion that it is newer or better.

The code-family regex is a DISPLAY heuristic only. Never use it to merge records, infer replacements, or infer vehicle fitment. The schema and migration rules take precedence over visual grouping.

## 6. What "lighter" means

Release goals are: a small application bundle, no catalogue literal in JS/HTML, no full-catalogue hydration into the main browser thread, indexed candidate retrieval, bounded result rendering, and no re-import on each launch.

Offline data still occupies disk storage. Indexes and a retained rollback version may make installed storage larger than the original compressed file. Report initial JS bytes, first catalogue download bytes, installed DB/index size, memory and search latency separately. Do not claim a percentage improvement before measurement.

The output is no longer a single self-contained HTML that can simply be double-clicked. The browser target is an HTTPS/local-development PWA. Native APK packaging is a separate deliverable; do not falsely mark it tested or create a native project unless requested. A future APK that must work offline on its very first launch needs a separate bundled seed catalogue, not a remote-only download.

## 7. Deployment and access assumptions

Default local development binds the API to loopback. No public deployment or new hosting purchase is authorized by this document. No browser-accessible import/write endpoint is required; controlled CLI import is sufficient.

For shared/private deployment, put the same-origin UI/API/snapshot service behind a tested authentication gateway, or scope a session-auth implementation separately. Public catalogue access must be an explicit operator choice. A downloaded offline catalogue is inherently readable on that device; moving prices out of HTML does not provide DRM or make base prices secret.

See `02-DATABASE-AND-MIGRATION.md`, `03-BACKEND-AND-SEARCH.md`, `04-FRONTEND-AND-OFFLINE.md`, `05-IMPLEMENTATION-PLAN.md`, and `06-VERIFICATION-AND-OPERATIONS.md` for the enforceable contracts.


---

<!-- Document: 02-DATABASE-AND-MIGRATION.md -->

# Database model and lossless migration contract

## 1. The central modelling rule

A technical code identifies a technical part; a logistics code identifies a source catalogue entry/variant. One technical part may have multiple logistics entries, different prices and different vehicle memberships. In this file 136 technical-code groups have differing model arrays across entries. Therefore compatibility, friendly labels, aliases and replacement data must be retained at ENTRY level, not blindly unioned onto the technical part.

A source row is NOT a stock quantity, supplier record, price-history event, or assertion that a replacement can safely fit another vehicle. Do not invent those meanings. Multiple source prices for one technical code are distinct current catalogue entries; do not discard all but `-01`, cheapest or most expensive.

## 2. Core schema

Use SQLite STRICT tables for production data. All versioned child relations must enforce same-version foreign keys, not merely unrelated integer IDs. Enable foreign keys on every connection. Use TEXT for all codes. Store original and normalized strings separately. Raw code uniqueness uses BINARY comparison; normalized search keys are indexed but NOT unique.

Use compact integer surrogate IDs. IDs need only be stable within an immutable catalogue version; external references always contain `catalogVersion` as well as the ID. Technical/logistics raw codes remain the business identity across releases. Client caches/cursors must never reuse a numeric ID against another version.

| Table | Required columns and constraints |
|---|---|
| `schema_migrations` | `version`, `checksum`, `applied_at`; schema versions are separate from data versions |
| `import_runs` | `id`, `source_sha256`, private archive path, start/end time, status, warnings/errors, report path, target version |
| `catalog_versions` | `id` TEXT PK, source SHA, schema/normalization/rules versions, created/published timestamps, nullable `price_effective_at`, `currency_unit`, counts, status `staging/validated/published/failed`, payload hash |
| `catalog_state` | singleton PK and `active_version_id`; activation changes only this pointer in a short transaction |
| `part_names` | integer PK, version ID, exact `name_raw`, `name_norm`, persisted `name_sort_rank`; UNIQUE(version, name_raw) |
| `parts` | integer PK, version ID, exact `tech_raw`, `tech_norm`, `name_id`, persisted `tech_sort_rank`; UNIQUE(version, tech_raw) |
| `catalog_entries` | integer PK, version ID, `part_id`, exact `log_raw`, `log_norm`, `base_price` INTEGER, `replacement_raw`, `source_row_ordinal`, `source_row_sha256`, `suffix01_rank`; UNIQUE(version, log_raw); UNIQUE(version, source_row_ordinal) |
| `vehicle_models` | integer PK, version ID, exact `name_raw`, `name_norm`; UNIQUE(version, name_raw) |
| `entry_vehicle_models` | version ID, entry ID, `ordinal`, model ID; PK(version, entry, ordinal); index(version, model, entry) |
| `entry_friendly_labels` | version ID, entry ID, ordinal, exact `label_raw`, normalized label; not authoritative compatibility |
| `entry_aliases` | version ID, entry ID, ordinal, exact alias, normalized alias |
| `entry_replacements` | version ID, entry ID, ordinal, raw token, normalized token; nullable resolved target part; unresolved tokens are allowed and retained |
| `vehicle_options` | version ID, option ID, label raw/norm, keywords raw/norm, `main/other`, display order, canonicalization provenance |
| `vehicle_option_models` | version ID, option ID, raw-model ID, ordinal; selection maps to an explicit set, not an inferred substring |
| `preset_families` | version ID, key, label, display order; derived from actual PRESET_FAMILIES rules |
| `preset_family_options` | version ID, family key, option ID, display order |
| `code_family_members` | version ID, part ID, derived display root, variant label, `rule_version`, `provenance=legacy_heuristic`, verified flag false by default |
| `search_documents` | version ID, integer doc ID, kind `name/alias/tech/log/replacement`, normalized value; unique dictionary of values per kind |
| `entry_search_documents` | version ID, entry ID, doc ID; reverse index for candidate resolution |
| `search_fts` | FTS5 trigram virtual table on normalized search-document values; derived, rebuildable |

Source arrays are ordered. Do not impose uniqueness on their values that could destroy duplicates or their order; use ordinal keys. The source archive additionally retains all original array values, empty strings and dictionary fields verbatim.

An explicit `part_prices` table is NOT needed just to duplicate `base_price` one-to-one. Price history is a read-only view/query across immutable catalogue versions, keyed by raw logistics code. Do not fabricate history dates from the current file. Do not persist calculated middle/final prices as independently editable values.

For a technical code with conflicting part names in a future import, block publication and emit a conflict report instead of overwriting a name. The supplied file has no such conflicts.

## 3. Indexes and validation

Create indexes for version + normalized technical code, version + normalized logistics code, normalized replacement token, model-to-entry memberships and option-to-model memberships. SQL LIKE with a leading wildcard is not automatically made fast by a normal B-tree. Infix candidates use trigram search as specified in document 03.

Maintain raw-string uniqueness even when normalization produces a collision. A normalized collision must return distinct matching records, not silently merge them. The supplied file has zero normalized technical/logistics collision groups under the existing normalizer; tests must still cover future collisions.

SQLite prices use its 64-bit INTEGER range with STRICT typing and a non-negative CHECK. Use safe integer/BigInt bindings. Serialize money to decimal strings before JSON encoding; convert surrogate IDs to JavaScript numbers only after verifying their safe-integer range. There are 386 existing prices above 2,147,483,647; a signed 32-bit column in another database would already be insufficient. Do not use floating point, bitwise integer conversion or JSON numeric coercion for money.

## 4. Price semantics

`currency_unit` is an explicit enum `UNKNOWN`, `IRR`, `TOMAN`, initially `UNKNOWN`. No multiplication/division by ten during migration. UI may show the neutral phrase "source price unit" until the operator supplies a verified unit. `price_effective_at` remains null. Retain import/publication timestamps under their correct names.

All API/snapshot money fields are decimal integer strings. Application code parses them with BigInt where calculations are required. Keep the raw source integer unchanged.

The existing calculation is `Math.round(base * 1.10)` and `Math.round(base * 1.20)`. For non-negative integer base values, implement shared integer half-up rounding with basis points:

```text
markedUp(base, bps) = (base * (10000 + bps) + 5000) / 10000
```

The division is integer division. bps is 1000 for middle and 2000 for final. Both derive from BASE, never apply 20% to the middle price. Example: base 1001 -> middle 1101 -> final 1201. Add exact corpus comparison against existing Math.round outputs; report any difference rather than silently changing commercial values.

## 5. Safe extraction

Do NOT execute uploaded HTML or scripts in the importer. No `eval`, `Function`, dynamic `import` of the file, `vm.runInContext` or regex extraction ending at the first `};`.

Parse HTML to script text, locate the unique top-level `const DB` variable using a JavaScript parser (for example parse5 + Acorn in the importer ONLY), and take the literal initializer source range. It must be a JSON-compatible object for this file. Parse that range with JSON.parse and validate against the complete source schema. Reject executable initializer expressions, duplicate DB declarations, unexpected non-data constructs or ambiguous sources. If future input is not JSON-compatible, emit an error rather than executing it.

Archive bytes and SHA-256 before extraction. Preserve the complete top-level DB object, including `parts`, `primary`, `others`, `groups` and `primaryOptions`, not only `rows`. Persist archive references and metadata in the import report; keep large audit source blobs out of hot search tables and browser bundles.

## 6. Import sequence

1. Locate the actual file in the Codex workspace; compare its SHA with the baseline. A mismatch requires a NEW inventory; do not force old counts onto newer data.
2. Preserve source bytes unchanged under the private source archive. Preserve existing workspace work. Create a scoped change checkpoint, not a destructive reset.
3. Extract and validate every source field. Record unknown/missing fields as explicit errors or retained extensions, never silently drop them.
4. Create an import run and deterministic version identity from source SHA + schema version + normalization version + rules version. Re-running an already successful identical import is idempotent.
5. Transform into staging rows, preserving raw strings and ordered arrays. Exact raw technical codes map to parts; exact raw logistics codes map to entries. Normalizers populate separate search columns only.
6. Build effective vehicle options using the existing rule: the old Tiggo 7 Pro Max option's model set is appended to Tiggo 7 Pro Max AWD; hide only the old UI option. Preserve source metadata and provenance.
7. Build normalized names, aliases, explicit memberships, replacement tokens and DISPLAY-only code families. Missing models stay an empty membership set, not "all vehicles".
8. Import in bounded batches into the staging version, build indexes, run all reconciliation tests and SQLite integrity/foreign-key checks. Staging data must be invisible to normal queries.
9. Generate version-pinned offline chunks and their manifest in a staging directory; verify each hash/count and test reconstructing the snapshot.
10. Mark validated only after source-to-database round-trip and database-to-offline round-trip pass. Publish immutable snapshot assets before changing the active version pointer. Crash recovery must never expose a pointer to absent files.
11. Switch the central pointer in one transaction. Keep the previous version and a usable backup. Failed imports do not modify the active pointer.
12. Write a machine-readable and readable migration report. Exit non-zero for a blocking error; do not report success based only on inserted row count.

## 7. Required exact reconciliation for this supplied source

Source SHA-256:

`5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480`

For the same source and rules, verify these values, all before publication:

* 36,569 source rows, 36,569 distinct logistics codes, 31,509 distinct technical codes.
* 13,045 exact name strings; 119 raw models.
* 192,630 ordered entry/model relationships; 59,116 ordered friendly labels; 738 ordered aliases.
* 1,809 rows with zero models remain searchable by global code/name.
* 5,883 non-empty raw replacement fields; preserve their complete values and parsed tokens.
* 3,750 technical codes retain multiple distinct base prices.
* Exact sum of raw base prices: 5,416,428,982,434. This is only a checksum aid, NOT revenue or inventory value.
* Raw primary options = 40; effective options = 39 after the legacy naming rule; other options = 77. Do not conflate raw and effective counts.

Reconstruct all eight row fields (`part`, `models`, `tech`, `log`, `price`, `replacement`, `friendly`, `aliases`) in source row order from the NORMALIZED database, not by merely reading the archive. Canonicalize object key order while preserving strings, array order and numeric values; compare every row hash and the complete reconstructed DB-row hash. Two datasets with matching counts/sums can still contain corrupt associations.

Compare all non-row metadata against the archived DB object. Classify deliberate canonicalized UI projections separately from lossless source data.

## 8. Required fixtures

`baseline/migration-fixtures.json` contains actual rows for:

* `0CF25BE-1500011BA`: five logistics entries including `-01` with a different price. All five remain.
* `112000177AA`: three logistics entries, one with NO models. Do not inherit siblings' memberships into that entry.
* `S11-5206500`: an original replacement string must remain intact.
* `0CF25B-1501113GA`: exact code/leading zero and normal search regression fixture.

Add malformed, duplicate-log, conflicting-name, unknown replacement-target and normalization-collision fixtures as synthetic tests. Do not insert synthetic fixtures into the production catalogue.


---

<!-- Document: 03-BACKEND-AND-SEARCH.md -->

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


---

<!-- Document: 04-FRONTEND-AND-OFFLINE.md -->

# Frontend performance and offline catalogue contract

## 1. Preserve the UI while changing the internals

Extract current styles without visual redesign into base/components/dark/motion files. Keep class names and Persian strings where practical. Move DOM events into focused modules with explicit state and cleanup. Reuse the source's model/part/code workflows, theme preference and reduced-motion intent.

The HTML/entry JS MUST NOT contain or import the source `DB`, the complete row array, an equivalent generated giant JSON module, or the full original HTML. Moving a literal into `data.ts`, then importing it synchronously, does not satisfy this task.

Initial startup loads the app shell, version metadata and small vehicle/preset metadata only. No `getAll()`/`.toArray()` over all entries on the main thread. A database is not an optimization if every launch immediately copies all its records into a global JS array.

Use query cancellation, request sequence IDs and 180ms debounce for suggestions. Enter/search-button executes immediately and supersedes pending debounce. Ignore results from stale request IDs or superseded versions. On mode switch/clear, cancel outstanding work and clear only UI state, not the catalogue.

## 2. Bounded rendering

Display 20 top-level results/families per page. Start with ordinary next/previous or "next page" controls that REPLACE the page, retaining a small navigation history. Do not append all pages to the DOM. Virtualization may replace this later only with evidence it is needed.

Family cards initially show summaries, not all hidden variants, prices and vehicle groups. Fetch/render at most 10 variants per family page and 10 entries per variant page; additional pages remain reachable. Details elements should not contain thousands of already-created hidden children.

Persist no query-result cache larger than 20 pages in memory. Drop version-specific caches when activation changes. Cache compact IDs/counts rather than duplicating full records. Animate at most the first 12 visible cards, respect reduced motion, and avoid per-card forced-layout loops.

Maintain keyboard focus and screen-reader announcements for search/loading/errors. Correct combobox/listbox roles, active descendant, arrows, Enter and Escape without changing the picker appearance. Do not create horizontal body overflow at 320/360/390/768px widths. Keep full technical codes copyable and LTR within RTL content. Do not prevent zoom through `maximum-scale=1` in the migrated viewport.

Small new UI: catalogue status, source-date availability, last successful update, download progress, retry/cancel, and offline-data readiness. Do not call an absent price-effective date "today's prices".

## 3. IndexedDB representation

Use one stable Dexie database with schema migrations, separate from catalogue release IDs. Include stores for `meta`, `catalogVersions`, compact `entries`, `parts`, `partNames`, `models`, explicit option/model memberships, ordered entry relationships, `searchDocuments` and their entry postings. Storage schema version changes only when object-store/index definitions change, not each price import.

All catalogue records and index keys include `version`. `meta` holds one `activeCatalogVersion`. Build a new dataset under a staging version in the same DB; atomically flip the pointer after checks. Published version data is read-only. Keep ordered arrays or relations so entries can be reconstructed without losing original values. Browser snapshots may use dictionary references rather than repeating model names thousands of times.

For exact/prefix search, use compound indexes `[version+techNorm]`, `[version+logNorm]` and the corresponding normalized dictionary value keys. Entries retain their own relationships; do not assign the union of a part's vehicle IDs to every entry.

For substring name/code search, IndexedDB has no automatic SQL-like contains index. Implement a derived n-gram index over distinct normalized search-document values:

* Store doc kind and normalized value once, with compact entry-ID postings.
* Generate distinct Unicode-code-point trigrams. Index document records with a MultiEntry array of simple keys such as `version|kind|gram`.
* Use a simple MultiEntry field, NOT a compound MultiEntry index; IndexedDB does not allow the latter.
* Intersect doc candidates within a term, verify the substring, then map to entry IDs. For multiple name terms, intersect ENTRY sets so terms may match different aliases of the same entry.
* Use a separate indexed version/model membership lookup to restrict vehicle queries.
* Treat `distinct()`/ID deduplication as necessary when multiple grams or aliases reach the same document/entry.

For a 1-2 character query, use exact/prefix indexes and a chunked dictionary cursor scan inside the worker when substring completeness requires it. Process no more than 500 dictionary records per work batch, yield, and check cancellation. Do not turn the scan into a giant main-thread array. Return exact results/counts after the search completes, with an honest searching state until then. No silent candidate caps.

Index creation runs once per new catalogue version during installation/update. Do not rebuild on each keystroke, vehicle selection or launch. Keep only queried posting lists/candidates in worker memory, not every row object. Measure index size; reject redundant indexes that offer no benchmark benefit.

## 4. Snapshot format

Publish an immutable, version-pinned manifest containing:

`catalogVersion`, `schemaVersion`, `normalizationVersion`, `rulesVersion`, `indexFormatVersion`, `sourceSha256`, `currencyUnit`, nullable `priceEffectiveAt`, `createdAt`, per-table counts, `rowCount`, and ordered chunk descriptors `{id, path, table, ordinal, recordCount, decodedBytes, sha256}`.

Each chunk is UTF-8 NDJSON of one table, at most 512 KiB of DECODED content under normal conditions. One single oversize record is rejected or explicitly handled with a documented bound. Use safe relative, allowlisted same-origin paths and immutable IDs. Snapshot chunks contain typed data only, never HTML or executable JavaScript. No credentials or admin metadata.

HTTP gzip/Brotli content encoding may compress transport. Hashes refer to the decoded bytes returned by Fetch, before parsing. The browser normally decodes HTTP content encoding; do not double-decompress. For an offline file pack, hash the same canonical decoded chunk bytes. Cap total declared bytes and total processed bytes to the configured import limit, and reject traversal/duplicate IDs.

Check the manifest/schema version before importing. Compute chunk hashes in the worker with Web Crypto where supported by the target secure context. A hash detects corruption, NOT a malicious replacement of both file and hash; authenticity comes from trusted/authenticated distribution. Do not advertise signatures unless a real signing/verifying scheme is implemented.

## 5. Install/update state machine

States: `empty`, `downloading`, `importing`, `indexing`, `validating`, `ready`, `failed`.

1. Read the active pointer. A validated local version may be queried immediately; do not wait for the network on each launch.
2. Fetch/revalidate the small active manifest on launch, explicit update or an online event. Never require unreliable background-sync scheduling for correctness.
3. If the version is unchanged, download NOTHING from the catalogue. An ETag/304 path must be tested.
4. Check estimated free space and request persistent storage where available. Calculate room for current version, staging data and indexes, not only compressed download size.
5. Acquire a cross-tab installer lease in an IndexedDB transaction (`owner`, expiry, version). Renew it between batches; support recovery after a crashed owner. Use BroadcastChannel for notifications, not as the only lock.
6. Download and verify each chunk, then commit its records and completed-chunk marker together in a transaction. Do NOT hold an IndexedDB transaction open across a network request. Import at most 500 records per batch, yielding as needed.
7. Resume only the same immutable version with verified completed chunks. Old active data remains untouched and searchable throughout.
8. Build search indexes; validate counts, required relationships, hashes and query fixtures. Mark the staged version `ready` only after success.
9. Atomically set `activeCatalogVersion` to the validated version and publish a cross-tab message. Cancel/restart visible searches against the new version; never mix results from versions.
10. Retain at least the previous valid version until no running query/tab has it pinned. Clean only superseded/staging data with explicit lifecycle rules, never the user's original source file.

On network loss, corrupt chunk, quota error or cancelled import, keep the active version. Show retry/resume and the last successful version. Do not erase the working catalogue to make room for an unverified update. If capacity cannot accommodate staging, offer an explicit limited-storage recovery flow; never silently downgrade offline coverage.

Requesting persistent browser storage may be denied, and users can clear app/browser data. Detect missing stores/active pointers on restart and restore from a trusted snapshot when online. Private/incognito modes cannot be treated as guaranteed durable installations.

## 6. Offline availability and packaging

The app is genuinely offline-ready only after BOTH shell assets and the local catalogue are verified installed. Use a persistent browser profile and test a browser close/relaunch with networking disabled, not just toggling DevTools after the page is already loaded.

Service Workers require a secure context (HTTPS, with local development exceptions). A loose `file://` HTML is not the intended deployment of this architecture. Provide local run instructions rather than pretending PWA caching works for double-clicked files.

Cache app-shell hashed assets and a navigation fallback. Do not cache authentication pages as the application, and exclude import/admin/API search responses from generic cache-first rules. Catalogue data belongs to IndexedDB. Coordinate app schema and catalogue schema compatibility: a newly installed shell must not destroy an older working catalogue or activate an incompatible version without a recovery path.

A future Android wrapper must be tested for stable origin, IndexedDB/Worker support, storage persistence and lifecycle behaviour. For offline operation on first APK launch, a separate seed snapshot must be included in the package and installed once. No APK performance, signing or compatibility claim is part of the present HTML-to-PWA migration until that wrapper is actually built and tested.


---

<!-- Document: 05-IMPLEMENTATION-PLAN.md -->

# PartsFinder Database Migration Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` when available to implement this plan task-by-task. The execution destination is the user's Codex workspace, not this planning response. Checklist steps track actual completion, never intentions.

**Goal:** replace the monolithic data-heavy HTML internals with a lightweight app, lossless central database and working offline replica.

**Architecture:** modular Node/Fastify/SQLite backend; existing UI extracted into Vite/TypeScript modules; IndexedDB/Dexie replica searched in a dedicated Worker. Imports stage immutable versions, validate them, then atomically activate them.

**Tech Stack:** TypeScript, Vite, Fastify, better-sqlite3, Dexie, Vitest, Playwright. Use verified supported releases and one lockfile.

**Spec:** `01-ARCHITECTURE.md` through `04-FRONTEND-AND-OFFLINE.md`, plus acceptance criteria in `06-VERIFICATION-AND-OPERATIONS.md`.

## Global constraints

Source is immutable; preserve all 8 row fields and top-level metadata; no row deletion to improve speed; no technical/logistics code conflation; unknown price unit remains unknown; 1000/2000 basis-point markups derive from base; main thread never hydrates the complete catalogue; default page 20; migration and snapshot publication require per-row reconciliation; offline operation and current recognizable UI must survive.

Commands below are REQUIRED scripts to create in the new workspace. They are not existing commands that have already been run. First inspect any existing package/test configuration; reuse equivalent commands and document exact substitutions.

## Review focus

1. Different logistics entries sharing a technical code must not inherit one another's prices or model memberships (Tasks 1-2).
2. Network/quota/process failure during an update must leave a usable active version (Tasks 4-5).
3. Persian-digit codes, short substrings and normalized collisions must not silently disappear (Tasks 1, 3, 6).
4. A version switch or rapid query change must not mix old IDs/results with new data (Tasks 3, 5-6).
5. Original-source archives and complete private snapshots must not be accidentally shipped as public JS/static assets (Tasks 5, 7).

## Task 1: source baseline, shared rules and safe extraction

**Files:** create `packages/domain/src/{types,normalize,pricing,vehicle-rules,code-family}.ts`, `packages/contracts/src/{catalogue,search,snapshot,errors}.ts`, `packages/importer/src/{extract-literal,validate}.ts`; tests `tests/unit/{source-extraction,normalization,pricing,vehicle-rules}.test.ts`; configure workspaces/TypeScript/Vitest alongside this deliverable.

**Interfaces:** `extractLegacyDb(html: string): LegacyDb`; `normalizeText(value: string): string`; `normalizeCode(value: string): string`; `calculatePrices(base: string): {base:string;middle:string;final:string}`; `buildVehicleOptions(db: LegacyDb): VehicleOptionProjection`.

- [ ] Preserve input SHA and inspect repository state. Write tests BEFORE implementation: extractor finds all 36,569 rows without executing a script; executable initializer and duplicate DB declarations are rejected; `calculatePrices('1001')` gives `{base:'1001',middle:'1101',final:'1201'}`; raw codes retain leading zero; normalization handles Persian digits.
- [ ] Run `npm run test:unit -- source-extraction normalization pricing vehicle-rules`; record the meaningful failing assertions.
- [ ] Implement the literal extractor and pure source-compatible rules; create raw/effective vehicle-option reports (40/39, with AWD memberships retained). Never put a production DB literal into test source code; load the private fixture/source path at test time.
- [ ] Run the same focused tests; compare all original rounded prices with the integer implementation; require zero unexplained differences.
- [ ] Save a scoped checkpoint and exact command/output evidence; do not commit private catalogue data to a public repository.

## Task 2: relational schema, import and round-trip verification

**Files:** `database/migrations/0001_catalogue.sql`, `apps/api/src/db/{connection,migrations}.ts`, `packages/importer/src/{transform,import,verify,cli}.ts`; tests `tests/integration/{migration,round-trip}.test.ts`.

**Interfaces:** consumes Task 1 types/rules; produces `importCatalogue(inputPath: string, options: ImportOptions): Promise<ImportReport>` and `verifyCatalogue(version: string): Promise<ReconciliationReport>`; required CLI `catalogue:import -- --file PATH --dry-run` and normal staged import.

- [ ] Write failing tests for complete per-field round-trip, identical-import idempotence, five retained logistics rows for `0CF25BE-1500011BA`, and the model-less `112000177AA` entry remaining model-less. Add future normalization-collision/conflicting-name fixtures.
- [ ] Run `npm run test:integration -- migration round-trip`; confirm failures demonstrate missing schema/behaviour, not missing test tools.
- [ ] Implement STRICT schema, version-scoped constraints, archive, staging transform, indexes and reports. Prices are 64-bit integers/decimal strings across the boundary. No DELETE of the active version during import.
- [ ] Run the focused tests and `npm run catalogue:verify -- --version VERSION`; assert all baseline counts, all reconstructed row hashes, metadata preservation and integrity checks. Inject a mid-import exception; active version must remain unchanged.
- [ ] Checkpoint schema/importer/report format together. Do not publish a merely inserted catalogue.

## Task 3: indexed query service and bounded API

**Files:** `packages/domain/src/ranking.ts`, `apps/api/src/{server,config}.ts`, `apps/api/src/modules/catalogue/*`, `apps/api/src/modules/search/*`, `apps/api/src/workers/*`; tests `tests/integration/{search,api,cursor}.test.ts`.

**Interfaces:** consumes Task 2 storage; produces CatalogueRepository/SearchRequest/SearchPage exactly as document 03, plus API route schemas and OpenAPI.

- [ ] Write failing tests: exact tech > exact replacement; `-01` never removes other entries; all vehicle/name membership sets match source; Persian-digit code is found; a code query cannot cross concatenated fields; short query is not falsely empty; `limit=101` fails; no page duplicates/missing matches; invalid cursor/version fails safely.
- [ ] Run `npm run test:integration -- search api cursor` and retain failure output.
- [ ] Implement B-tree/FTS5 candidates, literal matching, shared ranking, stored sort ranks, database worker and bounded queue; group/paginate by family when requested. Add only read routes and health endpoints.
- [ ] Rerun tests, record query plans for exact code/model/infix search, compare full ordered result sets with the source oracle except the explicitly documented corrections. Verify errors never expose SQL/private paths.
- [ ] Checkpoint API contract, query implementation and tests together.

## Task 4: offline snapshot export and central publication

**Files:** `packages/importer/src/publish.ts`, `scripts/export-snapshot.ts`, versioned snapshot routes from document 03; tests `tests/integration/{snapshot,publication}.test.ts`.

**Interfaces:** `exportSnapshot(version: string, targetDir: string): Promise<SnapshotManifest>`; `publishCatalogue(version: string): Promise<void>`; `rollbackCatalogue(version: string): Promise<void>`; manifest contract from document 04.

- [ ] Write failing tests: every decoded chunk hash verifies; source entry reconstruction from export is exact; missing/corrupt chunk prevents publication; a crash after asset creation but before pointer switch leaves the old version active; rerun resumes/idempotently completes without corrupting it.
- [ ] Run `npm run test:integration -- snapshot publication`.
- [ ] Implement <=512 KiB decoded table chunks, manifest checksums/counts, immutable paths and publication ordering. Snapshot routes enforce catalogue access policy.
- [ ] Rerun tests, reconstruct the entire catalogue from chunks and compare Task 2 row hashes. Exercise rollback and explicit-version requests after the active version changes.
- [ ] Checkpoint exporter, publish/rollback CLI and tests.

## Task 5: local database, Worker search and robust update activation

**Files:** `apps/web/src/offline/*`, `apps/web/src/workers/*`, `apps/web/src/data/{catalogue-repository,indexeddb-repository,http-repository}.ts`, `apps/web/src/application/{catalogue-service,update-service}.ts`; tests `tests/e2e/{local-search,update-recovery}.spec.ts`.

**Interfaces:** consumes repository/snapshot contracts; produces `installSnapshot(manifest: SnapshotManifest, signal?: AbortSignal): Promise<InstallReport>`, `activateVersion(version: string): Promise<void>`, and local CatalogueRepository behaviour.

- [ ] Write browser tests: complete IndexedDB data after import; offline results match server at the same version; 1-2 character input works; different aliases satisfy multi-term matching for one entry; no full-row array enters the main thread. Add multi-tab installer/crash/quota/network/corruption scenarios.
- [ ] Run `npm run test:e2e -- local-search update-recovery`; confirm the feature tests fail for the missing implementation.
- [ ] Implement staged version keys, short transactions, installer lease, chunk resume, n-gram/ID indexes, Worker cancellation and activation pointer. Never hold a DB transaction over Fetch. Shared normalization/ranking, not a second subtly different search engine.
- [ ] Rerun tests against real browser IndexedDB. Confirm a failed update preserves old search results, and an unchanged ETag/version causes zero catalogue chunk downloads.
- [ ] Checkpoint offline storage/update logic independently of cosmetic UI extraction.

## Task 6: UI extraction, paging and installable app shell

**Files:** `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/styles/*`, `apps/web/src/ui/*`, `apps/web/src/pwa/service-worker.ts`, `apps/web/public/manifest.webmanifest`; tests `tests/e2e/{ui-parity,paging,offline-relaunch}.spec.ts`.

**Interfaces:** consumes CatalogueRepository and update-service; user-facing source workflows remain recognizable; page size 20; details pages 10.

- [ ] Record original light/dark screenshots in an isolated local browser. Write failing workflow tests for both tabs, quick presets, ambiguous trim selection, clear/switch races, prices, model groups, keyboard navigation, reduced motion and 100 repeated page/query changes without DOM growth.
- [ ] Run `npm run test:e2e -- ui-parity paging offline-relaunch`.
- [ ] Extract styles/events into modules. Wire the repository without importing the legacy DB. Add progressive status/progress and bounded rendering. Cache only the app shell; make offline installation readiness explicit.
- [ ] Rerun tests at mobile/desktop widths. Close/relaunch browser with network disabled after installation and verify exact code/name/model searches. Confirm first-run offline without seed shows a recoverable setup state rather than empty-success.
- [ ] Checkpoint UI and shell with before/after screenshots and an explicit list of intentional small UI corrections.

## Task 7: performance gates, operational safety and final handoff

**Files:** `scripts/{measure-bundle,benchmark,verify-migration}.ts`, `docs/{migration-report,operations,performance}/`, root scripts/README/environment example; tests `tests/integration/backup-restore.test.ts`, `tests/e2e/security-boundary.spec.ts`.

**Interfaces:** deliver runnable project, reproducible import/export commands, real migrated SQLite database where the workspace permits, and evidence reports. An architecture-only answer is NOT completion of the Codex implementation task.

- [ ] Add tests for source/DB/archive absence in web distribution, safe snapshot path validation, restored backup query equivalence, private snapshot access and supported schema upgrades.
- [ ] Run focused safety tests; implement missing protections and operating scripts.
- [ ] Run the full verification sequence in document 06 ONCE after the final relevant code change; measure the original and migrated app under the same declared conditions.
- [ ] Review both code and reports: no placeholder implementation, TODO-only offline path, invented timings, ignored failed tests, silently removed rows or secret-bearing artifacts. List genuinely untested device/deployment conditions.
- [ ] Deliver code, migrated DB, reports, screenshots, run/update/rollback instructions, bundle/index sizes and outstanding limitations. Do not claim an APK exists unless actually built/tested.


---

<!-- Document: 06-VERIFICATION-AND-OPERATIONS.md -->

# Verification gates and operating instructions

## 1. Acceptance matrix

| Area | Required proof |
|---|---|
| Source safety | Original SHA unchanged; source archive outside public bundle; importer never executes uploaded source |
| Data migration | All row/relationship counts and all eight fields reconcile; repeated identical import creates no duplicate active data |
| Prices | Unknown unit preserved; all raw values exact; both markups match the original for every row; large values never wrap/truncate |
| Compatibility | Empty memberships remain empty; sibling logistics rows keep distinct model arrays; existing AWD label projection preserved |
| Search | Complete source-equivalent membership results plus explicitly tested corrections; exact/prefix/infix/name/alias/Persian-digit/short-query tests |
| Paging | Stable version-pinned results, no duplicates/missing hits; counts clearly distinguish entries/families/loaded children |
| Offline | Install then close/relaunch offline; both search workflows work; first-run empty state honest |
| Update | ETag no-op; interrupted/corrupt/quota/crashed/multi-tab import retains active version; valid activation atomic |
| UI | Light/dark, RTL/LTR codes, keyboard, touch, reduced motion, 320/360/390/768px layouts and bounded DOM verified |
| Operations | Backup restore tested; public/static bundles exclude private data; source and staging reports not served |

## 2. Proposed performance budgets (targets, NOT measured claims)

Measure on a declared desktop environment AND a real representative Android phone when available. Record hardware, OS, browser/WebView version, CPU throttling, network, dataset hash, warm/cold state, sample count and p50/p95. Desktop mobile emulation is not a real-device result.

* Application HTML + CSS + initial JS target <=250 KiB compressed, excluding catalogue download and optional icons. Explain any measured overshoot.
* No full catalogue transfer during normal warm launch; only metadata revalidation when needed.
* No complete catalogue object array in the main-thread heap or startup module graph.
* Warm exact-code search target p95 <=150ms locally; name/model query target p95 <=300ms locally. Broad/short-query fallback is reported separately, never hidden from the benchmark.
* Initial interface usable before first catalogue installation finishes. Show progress and allow cancellation; do not freeze the page.
* No application-generated main-thread task over 50ms attributable to bulk parsing/index building on the benchmark workload. Move bulk work to the worker and measure, rather than assume.
* Top-level result cards <=20 per visible page; DOM count does not monotonically grow after 100 page/query changes.

Report baseline vs new for startup JS parse/evaluation, memory, query latency, first install time, decoded/compressed snapshot size, IndexedDB/index size and total retained versions. Overall disk size may grow because indexes/rollback copies exist; do not misrepresent that as a failed or successful bundle optimization without separating metrics.

## 3. Verification commands to implement

These are the desired finished-project commands, not executions performed when this architecture pack was written. Codex must create/reuse the actual scripts and include exact output in its report.

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
npm run catalogue:verify -- --version VERSION
npm run check:bundle
npm run benchmark -- --source SOURCE_PATH --version VERSION
```

`catalogue:verify` must fail for any source-field mismatch, not only bad counts. `check:bundle` must inspect output/module imports for the original DB literal, raw source, giant catalogue modules, SQLite drivers and private archives. Test fixtures must not leak into production assets.

## 4. Backups and rollback

Use SQLite's online backup API (or a correctly quiesced/checkpointed documented equivalent). Copying only the main `.db` while WAL writes are live can omit committed data. Preserve necessary snapshots/source archives with the backup manifest and checksums. Never expose backup paths through the static server.

Import/update sequence: archive -> dry-run report -> stage -> reconcile -> export/validate chunks -> publish pointer -> retain previous version. Provide CLI commands:

```text
catalogue:import -- --file PATH --dry-run
catalogue:import -- --file PATH
catalogue:verify -- --version VERSION
catalogue:publish -- --version VERSION
catalogue:rollback -- --version PREVIOUS_VERSION
catalogue:backup -- --output PRIVATE_PATH
catalogue:restore -- --input PRIVATE_BACKUP --verify-only
```

`--verify-only` restores into an isolated temporary location and proves it can be queried; it does not overwrite the active database. Actual production restore/destructive retention cleanup requires explicit operator action and a documented checkpoint.

Retain old version data long enough for pinned requests and rollback. Automatic cleanup must never delete the only validated catalogue. Browser cleanup touches only managed local replica versions, not user files.

## 5. Deployment limits

Run the API as a single instance with persistent local storage. Bind loopback by default. Provide a documented same-origin HTTPS reverse-proxy deployment example with configured trusted proxies and a clear private/public access decision. Do not deploy to public hosting or change DNS from this task without authorization.

No credentials in source, snapshots, frontend environment variables or generated reports. For private deployment, authenticate search AND snapshot download at the same boundary. Browser offline data is readable to the device owner, and access cannot be retroactively revoked while offline; state that limit.

Review supported Node/driver/SQLite versions and known advisories at implementation time. Verify FTS5 trigram availability in the actual build; fail setup with actionable diagnostics if absent. Do not silently replace it with an unindexed global scan.

## 6. Final Codex report must contain

Provide actual changed-file summary, dependency versions, source/database counts, hash-reconciliation summary, migration warnings, test commands and results, performance measurements with environment, light/dark screenshots, how to run locally, how to publish updates, how to back up/roll back, and any untested real Android/APK/hosting behaviours.

Report separately: implemented, tested, not tested, blocked. Do not use "all tests passed" if tests were not run, "offline supported" for a TODO, or "data migrated" if only an empty schema was created.

The planning pack itself contains no migrated production DB and no running backend. Those are implementation deliverables for Codex.


---

<!-- Document: 07-SOURCE-NOTES.md -->

# Sources, provenance and limits

## Supplied project source

File: `PartsFinder_Android-28 (1) (1).html`.
SHA-256: `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480`.

`baseline/source-inventory.json` was generated by reading the actual bytes, parsing the literal DB as JSON without evaluating the application, and counting raw values. `baseline/migration-fixtures.json` contains selected actual source rows. Runtime-primary counts were computed from the explicit existing naming rule, not from a browser performance run.

Source functions examined include `norm`, `normCode`, `adjustedPrice`, `canonicalizeTiggo7ProMax`, `suffix01Rank`, `rowsForVehicle`, `codeSearchRows`, `partNameScoreForQuery`, `getResolvedVehicle`, `allVehicles`, `codeFamilyInfo`, `renderCodeFamilies`, `render`, `searchPart` and `searchCode`.

The pack does not claim a browser test, benchmark, Android-device test, migration execution or deployed backend was performed. Its architecture, schema, API, performance budgets and task sequence are proposed decisions for implementation, not pre-existing project features.

## Official technical references checked 2026-10-20

* SQLite use cases and concurrency trade-offs: https://sqlite.org/whentouse.html
* SQLite types and STRICT tables: https://sqlite.org/datatype3.html
* FTS5 trigram semantics and short-input limits: https://sqlite.org/fts5.html
* SQLite WAL deployment/locking considerations: https://sqlite.org/wal.html
* SQLite online backups: https://sqlite.org/backup.html
* better-sqlite3 supported runtimes, integers and worker support: https://github.com/WiseLibs/better-sqlite3
* Fastify validation and serialization: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
* Dexie MultiEntry constraints: https://dexie.org/docs/MultiEntry-Index
* IndexedDB, indexes, transactions and Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
* Service Worker secure-context requirement: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
* Browser storage persistence, quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

No ORM/version/performance claim should be inferred merely from these references. Codex must verify its installed versions and measured results in the actual target environment.


---

# Appendix: baseline/migration-fixtures.json

```json
{
  "0CF25BE-1500011BA": [
    {
      "part": "گیربکس اتوماتیک بدون تورک کانورتور",
      "models": [
        "TIGGO7 PRO Excellent",
        "X55 Pro Excellent Sport",
        "MVM X55 PRO Excellent",
        "TIGGO 7 Pro Premium"
      ],
      "tech": "0CF25BE-1500011BA",
      "log": "0CF25BE-1500011BA-04",
      "price": 2386956000,
      "replacement": "0CF25BE-1500011BA-GMS,0CF25BE-1500011BA-GB1,0CF25BE-1500011BA-GKH,0CF25BE-1500011BA-GAN",
      "friendly": [
        "X55 Pro Excellent",
        "X55 Pro Excellent Sport",
        "Tiggo 7 Pro Premium",
        "Tiggo 7 Pro IE / Excellent"
      ],
      "aliases": [
        "گیربکس کامل",
        "مجموعه کامل گیربکس",
        "complete gearbox",
        "transmission assembly"
      ]
    },
    {
      "part": "گیربکس اتوماتیک بدون تورک کانورتور",
      "models": [
        "TIGGO7 PRO Excellent",
        "X55 Pro Excellent Sport",
        "MVM X55 PRO Excellent",
        "TIGGO 7 Pro Premium"
      ],
      "tech": "0CF25BE-1500011BA",
      "log": "0CF25BE-1500011BA-02",
      "price": 2386956000,
      "replacement": "0CF25BE-1500011BA-GMS,0CF25BE-1500011BA-GB1,0CF25BE-1500011BA-GKH,0CF25BE-1500011BA-GAN",
      "friendly": [
        "X55 Pro Excellent",
        "X55 Pro Excellent Sport",
        "Tiggo 7 Pro Premium",
        "Tiggo 7 Pro IE / Excellent"
      ],
      "aliases": [
        "گیربکس کامل",
        "مجموعه کامل گیربکس",
        "complete gearbox",
        "transmission assembly"
      ]
    },
    {
      "part": "گیربکس اتوماتیک بدون تورک کانورتور",
      "models": [
        "TIGGO7 PRO Excellent",
        "X55 Pro Excellent Sport",
        "MVM X55 PRO Excellent",
        "TIGGO 7 Pro Premium"
      ],
      "tech": "0CF25BE-1500011BA",
      "log": "0CF25BE-1500011BA-03",
      "price": 2386956000,
      "replacement": "0CF25BE-1500011BA-GMS,0CF25BE-1500011BA-GB1,0CF25BE-1500011BA-GKH,0CF25BE-1500011BA-GAN",
      "friendly": [
        "X55 Pro Excellent",
        "X55 Pro Excellent Sport",
        "Tiggo 7 Pro Premium",
        "Tiggo 7 Pro IE / Excellent"
      ],
      "aliases": [
        "گیربکس کامل",
        "مجموعه کامل گیربکس",
        "complete gearbox",
        "transmission assembly"
      ]
    },
    {
      "part": "گیربکس اتوماتیک بدون تورک کانورتور",
      "models": [
        "TIGGO7 PRO Excellent",
        "X55 Pro Excellent Sport",
        "MVM X55 PRO Excellent",
        "TIGGO 7 Pro Premium"
      ],
      "tech": "0CF25BE-1500011BA",
      "log": "0CF25BE-1500011BA-01",
      "price": 3649644321,
      "replacement": "0CF25BE-1500011BA-GMS,0CF25BE-1500011BA-GB1,0CF25BE-1500011BA-GKH,0CF25BE-1500011BA-GAN",
      "friendly": [
        "X55 Pro Excellent",
        "X55 Pro Excellent Sport",
        "Tiggo 7 Pro Premium",
        "Tiggo 7 Pro IE / Excellent"
      ],
      "aliases": [
        "گیربکس کامل",
        "مجموعه کامل گیربکس",
        "complete gearbox",
        "transmission assembly"
      ]
    },
    {
      "part": "گیربکس اتوماتیک بدون تورک کانورتور",
      "models": [
        "TIGGO7 PRO Excellent",
        "X55 Pro Excellent Sport",
        "MVM X55 PRO Excellent",
        "TIGGO 7 Pro Premium"
      ],
      "tech": "0CF25BE-1500011BA",
      "log": "0CF25BE-1500011BA-05",
      "price": 2386956000,
      "replacement": "0CF25BE-1500011BA-GMS,0CF25BE-1500011BA-GB1,0CF25BE-1500011BA-GKH,0CF25BE-1500011BA-GAN",
      "friendly": [
        "X55 Pro Excellent",
        "X55 Pro Excellent Sport",
        "Tiggo 7 Pro Premium",
        "Tiggo 7 Pro IE / Excellent"
      ],
      "aliases": [
        "گیربکس کامل",
        "مجموعه کامل گیربکس",
        "complete gearbox",
        "transmission assembly"
      ]
    }
  ],
  "112000177AA": [
    {
      "part": "MCU",
      "models": [
        "Tiggo 8 PHEV",
        "TIGGO7 PRO PHEV",
        "F8 PRO e+",
        "Tiggo 8 Pro plug in hybrid",
        "F7 PRO e+"
      ],
      "tech": "112000177AA",
      "log": "112000177AA-02",
      "price": 5347571575,
      "replacement": "",
      "friendly": [
        "Tiggo 7 Pro PHEV",
        "Tiggo 8 PHEV",
        "Tiggo 8 Pro Plug-in Hybrid"
      ],
      "aliases": []
    },
    {
      "part": "MCU",
      "models": [],
      "tech": "112000177AA",
      "log": "112000177AA-03",
      "price": 4496456773,
      "replacement": "",
      "friendly": [],
      "aliases": []
    },
    {
      "part": "MCU",
      "models": [
        "Tiggo 8 PHEV",
        "TIGGO7 PRO PHEV",
        "F8 PRO e+",
        "Tiggo 8 Pro plug in hybrid",
        "F7 PRO e+"
      ],
      "tech": "112000177AA",
      "log": "112000177AA-01",
      "price": 5882328733,
      "replacement": "",
      "friendly": [
        "Tiggo 7 Pro PHEV",
        "Tiggo 8 PHEV",
        "Tiggo 8 Pro Plug-in Hybrid"
      ],
      "aliases": []
    }
  ],
  "S11-5206500": [
    {
      "part": "شیشه جلو",
      "models": [
        "MVM110- 3 cyl",
        "MVM110- 4 cyl",
        "MVM110-AMT"
      ],
      "tech": "S11-5206500",
      "log": "S11-5206500-02",
      "price": 2452699,
      "replacement": "S11-5206500BE",
      "friendly": [],
      "aliases": []
    },
    {
      "part": "شیشه جلو",
      "models": [
        "MVM110- 3 cyl",
        "MVM110- 4 cyl",
        "MVM110-AMT"
      ],
      "tech": "S11-5206500",
      "log": "S11-5206500-03",
      "price": 95400433,
      "replacement": "S11-5206500BE",
      "friendly": [],
      "aliases": []
    },
    {
      "part": "شیشه جلو",
      "models": [
        "MVM110- 3 cyl",
        "MVM110- 4 cyl",
        "MVM110-AMT"
      ],
      "tech": "S11-5206500",
      "log": "S11-5206500-01",
      "price": 126987155,
      "replacement": "S11-5206500BE",
      "friendly": [],
      "aliases": []
    }
  ],
  "0CF25B-1501113GA": [
    {
      "part": "پیچ درپوش تخلیه روغن",
      "models": [
        "X33 Cross CVT",
        "X22 AT sport lux c",
        "X22 Pro IE Turbo",
        "X22 1.0 Turbo"
      ],
      "tech": "0CF25B-1501113GA",
      "log": "0CF25B-1501113GA-01",
      "price": 3949733,
      "replacement": "",
      "friendly": [
        "X33 Cross CVT",
        "X22 Pro IE Turbo"
      ],
      "aliases": []
    }
  ]
}
```


---

# Appendix: baseline/source-inventory.json

```json
{
  "source_file": "PartsFinder_Android-28 (1) (1).html",
  "sha256": "5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480",
  "bytes": 11417283,
  "db_utf8_bytes": 11354916,
  "row_count": 36569,
  "unique_tech": 31509,
  "unique_log": 36569,
  "unique_part_names": 13045,
  "raw_model_count": 119,
  "no_models": 1809,
  "no_friendly": 22720,
  "tech_with_multiple_prices": 3750,
  "tech_with_multiple_part_names": 0,
  "nonpositive_prices": 0,
  "non_integer_prices": 0,
  "max_price": 31433732625,
  "prices_over_signed_int32": 386,
  "db_keys": {
    "rows": 36569,
    "parts": 13045,
    "primary": 40,
    "others": 77,
    "groups": 10,
    "primaryOptions": 40
  },
  "row_keys": [
    "aliases",
    "friendly",
    "log",
    "models",
    "part",
    "price",
    "replacement",
    "tech"
  ],
  "tech_normalized_collision_groups": 0,
  "log_normalized_collision_groups": 0,
  "tech_with_different_models": 136,
  "tech_with_different_friendly": 59,
  "tech_with_different_aliases": 0,
  "tech_with_different_replacement": 0,
  "model_links_count_including_order": 192630,
  "friendly_links_count_including_order": 59116,
  "alias_links_count_including_order": 738,
  "rows_with_replacement": 5883,
  "raw_models_normalized_count": 119,
  "runtime_primary_options_after_legacy_rule": 39,
  "runtime_others_after_legacy_rule": 77,
  "data_share_percent": 99.4537,
  "source_price_sum_exact_integer": "5416428982434",
  "unknown_currency_unit": true
}
```

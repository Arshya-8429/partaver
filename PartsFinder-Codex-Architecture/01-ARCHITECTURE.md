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

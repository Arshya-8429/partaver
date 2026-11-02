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

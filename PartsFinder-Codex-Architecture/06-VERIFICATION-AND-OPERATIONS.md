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

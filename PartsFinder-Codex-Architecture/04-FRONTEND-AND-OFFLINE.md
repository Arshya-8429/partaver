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

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

# PartAvar - Architecture, Data Model, and Migration Requirements

## 1. Architectural principle

PartAvar must separate:

1. immutable/versioned catalogue data,
2. search/index structures,
3. user operational documents,
4. historical price observations,
5. presentation/UI state,
6. import/update tooling.

Do not restore a giant inline `const DB` in HTML or JavaScript.

---

## 2. Preferred stack

Unless an equivalent implementation is already working in the repository:

- Node.js LTS
- TypeScript
- Vite
- Fastify
- SQLite / `better-sqlite3`
- Dexie / IndexedDB
- Web Worker
- Service Worker / manifest
- Vitest
- Playwright

Use one package manager and one lockfile.

Pin supported dependency versions. Do not leave floating `latest` dependencies in the final implementation.

---

## 3. Suggested repository boundaries

Adapt to the actual repository rather than forcing exact filenames.

```text
apps/
  web/
    src/
      app/
      catalogue/
      search/
      invoices/
      purchase-lists/
      packages/
      price-intelligence/
      settings/
      ui/
      styles/
      workers/
      offline/
      website/
  api/
    src/
      modules/
        catalogue/
        search/
        documents/
        price-history/
        settings/
      db/
packages/
  domain/
  contracts/
  importer/
database/
  migrations/
scripts/
tests/
docs/
private-data/
```

The public marketing website may live in the same Vite workspace if routing/build separation stays clean.

---

## 4. Catalogue data identity

The previous migration specification remains binding.

Every source row includes fields equivalent to:

- `part`
- `tech`
- `log`
- `price`
- `models`
- `friendly`
- `aliases`
- `replacement`

Preserve all of them losslessly.

### Critical identity rule

A technical code can map to more than one logistics row.

Therefore:

- technical code is not a unique row key,
- logistics code identity must be preserved,
- entry-specific price and model membership must remain attached to that entry,
- sibling logistics rows must not inherit one another's data.

Use stable internal entry IDs in addition to raw codes.

---

## 5. Price storage

Catalogue prices can exceed signed 32-bit integer range.

Use an integer-safe representation throughout database, API, worker, and UI boundaries.

Do not pass large prices through lossy JS floating-point transformations when exact integer semantics are needed.

Preserve the raw source price.

Derived prices:

- middle = rounded base * 1.10 according to the tested legacy rule,
- final = rounded base * 1.20 according to the tested legacy rule.

Do not compound final on middle.

The source does not prove currency unit or effective date. Keep both nullable/unknown unless a new trusted source provides them.

---

## 6. Legacy source reconciliation

The original baseline measured:

- 36,569 rows,
- 31,509 distinct technical codes,
- 36,569 logistics codes,
- 13,045 part-name strings,
- 119 raw vehicle-model strings.

These are assertions for the original supplied source only.

The latest Windows and Android v3.0.1 files must be re-measured.

Required migration process:

1. hash every supplied source file,
2. safely extract the literal catalogue without executing arbitrary script,
3. compare DB literals between original/Windows/Android sources,
4. archive originals unchanged,
5. stage the relational import,
6. validate every source row and relationship,
7. reconstruct exported rows,
8. compare full per-row hashes,
9. activate only after reconciliation passes.

Count matching alone is insufficient.

---

## 7. Catalogue tables

Use the previous migration plan's normalized structure or a proven equivalent.

At minimum model:

- catalogue versions,
- catalogue entries,
- part names,
- technical codes/raw+normalized,
- logistics codes/raw+normalized,
- vehicle models,
- entry-vehicle memberships,
- friendly labels,
- aliases,
- replacements,
- source metadata,
- release/import metadata.

Preserve ordering where source behavior depends on order.

---

## 8. Operational document storage

Catalogue data is immutable/versioned.

Invoices, purchase lists, and packages are separate mutable operational data.

Suggested entities:

### Invoice

- id
- human-readable number if configured
- created_at
- updated_at
- status
- optional customer snapshot fields
- optional notes
- grand_total
- currency_unit nullable/configured
- source_catalog_version

### Invoice line

Snapshot fields at creation time:

- invoice_id
- line_id
- catalogue_entry_id nullable if legacy/manual
- raw part name
- raw technical code
- raw logistics code
- selected vehicle context
- base_price_snapshot
- price_mode
- custom_percent nullable
- unit_price
- quantity
- line_total

Do not recalculate historical invoice lines when catalogue prices later change.

### Purchase list / package

Use the same snapshot principle for identifiers and selected prices.

---

## 9. Historical price data storage

Historical price files are separate source evidence and must not overwrite the current catalogue.

Create immutable import batches and price observations.

Suggested fields:

- observation_id
- import_batch_id
- source_file_name
- source_file_sha256
- source_sheet
- source_row_reference
- observed_at / effective_date nullable until explicitly known
- raw_technical_code
- raw_logistics_code
- matched_catalogue_entry_id nullable
- raw_price
- normalized_price integer-safe
- currency_unit nullable
- match_status
- ambiguity_reason nullable

Never fabricate a date from file import time.

Never fan one technical-code observation out to all sibling logistics entries unless the source explicitly proves that relationship.

---

## 10. API boundaries

Keep APIs bounded and typed.

Suggested modules:

- `/api/catalogue/...`
- `/api/search/...`
- `/api/invoices/...`
- `/api/purchase-lists/...`
- `/api/packages/...`
- `/api/price-history/...`
- `/api/catalogue-status/...`

Admin/import write endpoints must not be public by accident.

If authentication is not implemented yet, keep sensitive import operations CLI/local-only rather than exposing an unauthenticated browser write route.

---

## 11. Security

- validate request schemas,
- limit page sizes,
- sanitize/escape catalogue text in UI,
- never expose filesystem/database private paths in errors,
- keep source archives and SQLite files outside the web root,
- no arbitrary file execution during import,
- parse Excel/HTML sources as data,
- validate ZIP/path traversal if archive import is added,
- use same-origin distribution for snapshots unless a reviewed policy says otherwise.

---

## 12. Migration of current local browser data

The legacy HTML may contain localStorage records for:

- theme,
- invoice draft/history,
- purchase list,
- saved packages.

A new web origin cannot automatically read old file-origin localStorage.

Do not claim automatic migration if technically impossible.

Provide:

- optional export/import compatibility where feasible,
- a clear one-time migration mechanism if legacy data is available,
- no silent loss.

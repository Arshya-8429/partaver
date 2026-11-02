# Historical price imports and operations

Implemented in `packages/importer/src/price-history`, `packages/domain/src/price-history.ts`, and `apps/api/src/price-history`. Import operations run locally. All HTTP history endpoints are read only. Current catalogue data is opened with SQLite `readonly: true` and remains separate from `private-data/sqlite/operations.db`.

## Evidence and production status

No historical company workbook was supplied with the master pack. No production historical observations have been invented or imported. The application therefore reports neutral, insufficient history for catalogue entries without committed observations. Historical company data remains a required operator input.

The test suite generates actual XLSX files marked **TEST FIXTURE ONLY**, imports them into temporary SQLite databases, and deletes those temporary environments after verification. `reports/partavar/price-history-fixture-imports.json` records the actual SHA-256, sheet names, batch IDs, effective-date/matching outcome counts and status for every successfully staged fixture batch in the most recent run. Those prices and dates are fabricated test inputs, not business evidence.

A small inspect-only demonstration workbook is retained at `reports/partavar/price-history-test-fixture.xlsx` with `price-history-test-mapping.json`; its title and first sheet explicitly mark it as fabricated test data. `price-history-cli-inspect.log` records the actual workspace CLI wrapper reading that workbook. It was not imported into production storage.

## Operator workflow

The exported entry point is `runPriceHistoryCli(argv: string[]): Promise<unknown>` from `packages/importer/src/price-history/cli.ts`. The workspace script wrapper invokes it and prints JSON. Replace all example paths, versions and batch IDs with reviewed inputs. `--operations` and `--catalogue` default to the private paths above and `private-data/sqlite/catalogue.db` respectively.

```sh
pnpm partavar:prices inspect --source /private/company-prices.xlsx
pnpm partavar:prices stage --source /private/company-prices.xlsx --mapping /private/history-mapping.json --version CATALOGUE_VERSION
pnpm partavar:prices preview --batch BATCH_ID --limit 100 --offset 0
pnpm partavar:prices commit --batch BATCH_ID --actor 'Operator name' --reason 'Reviewed original file, mappings, dates and reconciliation'
```

`inspect` makes no database changes. `stage` archives the original source, inserts immutable batch/row evidence, and leaves it invisible to readers. `preview` provides at most 1,000 rows per page; the default is 100, with `nextOffset` for further inspection. `commit` activates the staged batch and recomputes compact metrics in one transaction. Import timestamp is recorded as import metadata and never substitutes for effective date.

Example explicit mapping:

```json
{
  "sheet": "PriceHistory",
  "headerRow": 1,
  "columns": {
    "technicalCode": "A",
    "logisticsCode": "B",
    "partName": "C",
    "price": "D",
    "effectiveDate": "E"
  },
  "effectiveDate": null,
  "currencyUnit": "IRR"
}
```

Fields map to distinct Excel column letters A–IV. The effective-date column is optional. A trusted file-wide `effectiveDate: "2025-03-20"` may be supplied explicitly; blank/missing row dates then use that declared date. With neither source, dates stay null. Dates accept ISO Gregorian text or actual Excel date cells. Jalali/locale strings and bare Excel serial numbers require reviewed conversion; the importer does not guess the calendar. Optional `currencyUnit` column values must explicitly be `UNKNOWN`, `IRR`, or `TOMAN`. Without that column, the file-wide declared unit is retained without conversion.

All identifier/name cells must be plain text, retaining leading zeroes and raw spelling. Numeric price cells must be nonnegative safe integers. Larger prices must be plain integer text. Persian/Arabic digits and valid thousands groups are accepted; fractional, negative, exponent, missing and unsafe numeric prices are rejected and reported. Formulas, cached formula results, hyperlinks, rich-text, error and merged input cells require operator review and plain-value conversion. The immutable workbook archive preserves all original cells, including rejected values and unmapped columns.

Only `.xlsx` is supported by the pinned ExcelJS 4.4.0 dependency. `.xls`, encrypted/ZIP64 archives and unsupported ZIP compression are rejected. Workbook bounds are 20 MiB compressed, 100 MiB expanded, 4,096 ZIP members, 100 sheets, 100,000 data rows and 256 columns per sheet. ZIP directories, paths and actual decompressed sizes are checked before ExcelJS parses the workbook. The [upstream ExcelJS documentation](https://github.com/exceljs/exceljs) documents its XLSX reader; no spreadsheet formulas execute during import.

## Matching, immutability and corrections

Matching is pinned to an explicit retained catalogue version. Exact raw logistics code has priority. An explicitly supplied technical code must agree with that logistics entry; a mismatch remains unmatched. A technical-only row resolves only when its candidate set is unique, including an explicitly supplied normalized exact part-name constraint where useful. Ambiguous rows keep candidate IDs and a reason; they create no matched observations for siblings. A summary affected by unresolved candidate ambiguity remains neutral.

Each source has SHA-256, original filename, byte length, detected sheets and an unchanged archive at `private-data/sqlite/price-history-sources/SHA256.xlsx`. Each batch preserves mapping, pinned version, stage timestamp and reconciliation counts. Each row preserves sheet, row number, raw values, normalized exact price, date, currency, match outcome and candidate IDs. SQLite triggers reject changes/deletion of source, batch, observation and audit-event evidence. Batch activation state, settings and precomputed metrics are derived state.

Reimporting the same bytes, version and equivalent mapping returns the existing batch. Exact duplicate rows in one mapped sheet are reported and excluded from metrics. Identical date/price evidence in different files remains traceable; it contributes only one chronological point. Conflicting prices or units on the same date are preserved, keep the summary neutral and suppress change percentages. No import overwrites current catalogue prices.

Corrections create new evidence and identify an active batch to supersede:

```sh
pnpm partavar:prices stage --source /private/corrected-prices.xlsx --mapping /private/history-mapping.json --version CATALOGUE_VERSION --supersedes OLD_BATCH_ID
pnpm partavar:prices preview --batch NEW_BATCH_ID
pnpm partavar:prices commit --batch NEW_BATCH_ID --actor 'Operator name' --reason 'Corrected source received from company'
pnpm partavar:prices rollback --batch NEW_BATCH_ID --actor 'Operator name' --reason 'Correction withdrawn after review'
```

Supersede records an audit event and disables the old batch atomically with activation of the new batch. Rollback preserves all evidence and audit events. If the rolled-back batch superseded another batch, it reinstates that exact predecessor only while its supersession state is intact and its archive passes a fresh SHA check. Repeated active commits and repeated completed rollbacks are idempotent. Reusing a file with a changed mapping requires explicit supersede. Committing checks the archived source SHA again before activation. Empty actor/reason is rejected. There is no destructive delete command.

Entry IDs are always qualified by catalogue version. Importing against a new retained version requires an explicit matching review; history is not silently assigned to an ID from another version, even when raw codes are similar. Existing version histories stay available while their catalogue versions are retained.

## Metrics and configurable classification

Metrics use ordered distinct explicit dates. They retain earliest/latest/min/max exact prices, absolute change, cumulative change, previous-to-latest change, dated observation count, total evidence count, undated count, conflict/ambiguity counts, currency and first/last dates. Cumulative and previous changes are signed integer basis-point strings, rounded to the nearest basis point with halves away from zero. `1000` basis points means 10%. Monetary values remain decimal strings throughout SQLite, JSON and browser boundaries. Zero baseline leaves percentage growth undefined and neutral. No annualization, smoothing, guessed dates or profit-margin claims occur.

Threshold defaults are medium at 10%, high at 30%, with at least two distinct dated observations. Nonpositive growth is low. Unknown or mixed units, insufficient dates, ambiguous identity, same-date conflicts and zero baseline keep classification neutral. An undated point remains evidence and never extends the chronological date range.

Relative mode uses exact growth ordering with midranks for ties over the valid population of that pinned version and configured minimum observation count. Default percentile boundaries are 3,333 and 6,667 basis points. A population with fewer than two eligible entries remains neutral in relative mode. Nonpositive growth remains low even if ranked high. No negative/zero value is presented as increased margin.

The domain exports `DEFAULT_PRICE_HISTORY_SETTINGS`, `validateHistorySettings`, `calculateHistoryMetrics`, `percentileRanks`, and `classifyPriceHistory`. Browser operator preferences may classify the compact exact `cumulativeChangeBps` and bounded `percentileBps` without fetching observations. To change audited server defaults, provide all six fields:

```json
{"strategy":"threshold","mediumBps":1000,"highBps":3000,"mediumPercentileBps":3333,"highPercentileBps":6667,"minimumObservations":2}
```

```sh
pnpm partavar:prices settings --settings /private/history-settings.json --actor 'Operator name' --reason 'Approved price-movement boundaries'
```

Server settings changes recompute all retained imported versions and record the previous/next values. For browser preferences that raise the minimum count, an operator can still classify summaries locally; server percentile population itself changes only through this audited command.

## Bounded read contracts

`registerPriceHistoryRoutes(server, {cataloguePath, operationsPath})` registers:

| Route | Bounds and result |
| --- | --- |
| `GET /api/v1/price-history/summary?version=V&ids=1,2` | 1–20 IDs; metrics only; no observations |
| `GET /api/v1/price-history/entries/ID?version=V&limit=50&cursor=...` | Maximum 50 chronological evidence records; source filename/SHA/sheet/row, no private path |
| `GET /api/v1/price-history/entries?version=V&limit=20&sort=growth` | Maximum 20 summaries, exact raw name/codes and current catalogue `basePrice`; optional classification, minimumObservations, from, to, cursor |

List `sort` accepts `growth` or `date`. **`from`/`to` filter the latest explicit observed date of the precomputed full-history summary. They do not recalculate a selected-window change or percentile population.** Arbitrary window analysis is not implemented. The list covers entries with active imported evidence or unresolved candidate ambiguity; summary-by-IDs returns neutral for any valid entry without history. Detail observations load lazily; no history is bundled in initial frontend JavaScript.

Version is mandatory; only published retained catalogue versions are readable. All limits, dates, IDs and cursors are validated. Cursors bind the catalogue version, relevant query/entry and history revision. A concurrent audited change returns a stale-cursor error instead of mixing pages. Read transactions keep revisions, metrics and evidence consistent. Missing history storage returns honest neutral summaries and empty timelines. Unexpected storage errors return sanitized `HISTORY_UNAVAILABLE`, without filesystem paths. No import, settings or mutation route is registered.

DTOs: `HistoryMetrics`, `PriceHistorySettings`, `PriceHistorySummaryDto`, `PriceHistoryEntryDto`, `PriceHistoryObservationDto`, and `PriceHistoryListDto` are exported from `packages/contracts/src/price-history.ts`.

## Backup and restore

```sh
pnpm partavar:prices backup --output /private/backups/history-2026-10-27
pnpm partavar:prices restore --backup /private/backups/history-2026-10-27 --operations /private/restored-operations/operations.db
```

Backup uses SQLite's online backup API for the whole operations database, then copies the immutable price-source archives referenced by that snapshot. Its manifest records database/source hashes, batch and observation counts. Source checksums and SQLite integrity are verified. This also captures operational document rows stored in the same database; external operational artifacts, catalogue source archives, catalogue snapshots and the separate catalogue database still require the catalogue/document backup procedures.

Restore requires a fresh destination database and source-archive directory. It verifies the database SHA, SQLite integrity, foreign keys, history schema, all source SHAs and exact count/source reconciliation before copying. It refuses an existing destination and preserves the original database. Switch application configuration only after the restored environment has been reviewed. An interrupted restore may leave an incomplete fresh destination; use another fresh path. SQLite online backup behavior is documented in the [SQLite backup API](https://sqlite.org/backup.html).

## Verification record

Passed in the local Node/Vitest environment: exact large prices, grouped Persian digits, leading-zero text codes, shared technical ambiguity, exact logistics matching, duplicate file/row handling, unknown/missing/invalid dates, negative/zero growth, same-date conflicts, configurable thresholds and percentiles, staged invisibility, explicit commit, source tamper rejection, immutable SQL evidence, catalogue-byte preservation, retained-version isolation, bounded lazy HTTP detail, sort/filter, stale cursors, supersede/rollback, actor validation, checksum-verified backup and restore, tampered backup refusal and fresh-destination refusal.

Actual focused output: `reports/partavar/price-history-green.log`. Assertion-level regression red evidence is retained in `price-history-regression-red.log`, `price-history-tamper-red.log`, `price-history-rollback-red.log` and `price-history-currency-catalogue-red.log`; the initial missing-module/dependency runs are retained separately and are not claimed as assertion-level red tests. Full workspace unit/integration results are recorded in `price-history-workspace-tests.log`; other agents' concurrent changes may be reflected in that run. Scoped ESLint and TypeScript diagnostics are recorded separately at handoff.

Not tested: real company workbooks, production populated-history scale, concurrent OS processes importing the same source, alternate Excel exporters, native Android, production authentication gateways and network latency. No `.xls` parser, Jalali conversion, automatic cross-version rebasing or arbitrary analysis-window recomputation is implemented. These boundaries are explicit and rejected or represented neutrally.

# Search verification

Final source review: 2026-10-28. The source acceptance checks passed within the environments below. Final release ZIP verification is tracked separately in [the release audit](../reports/release-2026-10-28/spec-audit.md); it was pending when this document was finalized.

## Passed

The active catalogue is `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1`: 36,569 logistics entries, 31,509 technical codes and 119 raw models. [Fresh complete reconciliation](../reports/release-2026-10-28/migration-verification.json) verifies every field/hash, metadata, original raw codes, ordered relationships and prices, with zero differences/FK violations and integrity `ok`. [Three-source comparison](../reports/partavar/source-reconciliation.json) proves the supplied catalogue objects equal without executing their scripts.

[Final unit/integration run](../reports/release-2026-10-28/final-core-suite.log): 87 passed across 23 files. [Final Chromium E2E run](../reports/release-2026-10-28/final-e2e.log): 25 passed. [Cross-engine matrix](../reports/release-2026-10-28/browser/combined-case-matrix.json): 27 unique scenarios have passing latest relevant executions, nine per engine. This matrix combines initial and focused follow-up runs; it is not one 27-case green execution.

| Contract | Evidence |
| --- | --- |
| Vehicle + name and global code/name modes | `ui/search.ts`; final online workflows in Chromium 156.0.8078.48, Firefox 157 and Playwright WebKit 27.2 |
| All raw models and explicit trim choices | Vehicle/API/domain tests; preserves preferred/family/other choices, X33 Cross CVT/MT and tested AWD naming projection |
| Exact/prefix/infix codes and replacement tokens | `tests/integration/search.test.ts`; separate fields, original logistics identity and full membership |
| Persian/Arabic digits and multi-term aliases | Shared normalization and search regressions |
| `-01` preference without losing siblings | Unit/integration fixtures; independent price/fitment retained |
| Stable version/query/filter cursors and bounded results | Search regressions and actual pagination; UI replaces pages of at most 20 cards |
| Short and broad substring queries | Dedicated Worker fallback, exact counts/order and real catalogue parity |
| Rapid query/clear/mode changes | Stale-response regression; cancelled work cannot repopulate cleared results |
| Exact copy and lazy details | Browser clipboard success/failure, full codes/prices and bounded family/logistics children |
| Related suggestions | Real entry rules, explicit ambiguous logistics selection, selected-vehicle filtering |
| Online/offline parity | Full 36,569-row IndexedDB installation in all three engines; same 11-entry exact-code results |
| Version change in another tab | Broadcast/focus/visibility regressions refresh local version and invalidate stale rows while retaining query text |
| Historical badge identity | Retained older documents cannot recolor a current version sharing its numeric entry ID |

The two version regressions were genuine source defects and were fixed with red→green evidence. The per-case matrix identifies which final run supports each scenario; [browser release report](../reports/release-2026-10-28/browser/browser-release-report.md) explains initial harness/environment failures separately.

## Measured performance

[Fresh API benchmark](../reports/release-2026-10-28/api-benchmark.json): seven samples after two warmups on local Node 24.19/macOS arm64/Apple M4. Exact-code p95 4.64 ms, name phrase 12.98 ms, vehicle/name 45.87 ms; two-character fallback 131.12 ms, reported separately. These are Fastify/SQLite Worker injection timings, excluding network/browser.

[Local browser measurements](../reports/release-2026-10-28/browser/performance-summary.json) include Worker work and DOM updates: seven warm samples after two warmups. Exact/name/vehicle p95 values meet proposed 150/300/300 ms targets on the tested host in all engines. Chromium/Firefox timings precede the final visual ResizeObserver scheduling correction; Worker/search logic was unchanged. Final WebKit timings include that correction.

Cold broad queries remain slow: first three-character `150` query was 9.181 s in Chromium and 8.448 s in final WebKit. Warm cached timings do not erase that limitation. See [performance report](performance-report.md), including actual startup transfer and the conservative bundle gate.

## Failed / blocked / not tested

- No open source regression remains in this scoped search gate. Earlier failed runs remain retained as diagnostic/red evidence.
- Real Android/WebView and actual software-keyboard suggestion overlay behavior are not tested. Custom listbox and autocomplete/correction controls are implemented; desktop mobile widths do not establish phone keyboard behavior.
- Actual Safari 18.3 testing is blocked because remote automation is disabled; settings were not changed. Playwright WebKit is not Safari/iOS certification.
- Real screen-reader and low-end hardware testing remain unavailable. Single-host measurements do not certify target-device performance.

# PartAvar release acceptance and source audit — 2026-10-28

**Source/runtime acceptance: verified within the declared local scope. Final release ZIP/artifact verification: pending.** No open source regression remains in this bounded audit. The parent release process will write the final artifact receipt beside the ZIP after this source snapshot is frozen; this report does not imply that an unverified ZIP is ready or that a public deployment has occurred.

## Final evidence and coverage

Read all master specifications 00–10, the complete migration reference/appendices, redesign brief and source inventory. Reviewed existing remaining-work, migration/history/operations/UI evidence, document storage/export/print, history matching/metrics/read routes, offline install/search/Worker version boundaries, API/snapshots and private static/access boundaries. No AGENTS.md exists under the workspace parent; this workspace has no Git metadata. This was a bounded acceptance/source review, not a full formal Codex Security scan or proof against every possible defect. No production database was written by this audit; regression data was disposable browser IndexedDB.

| Gate | Actual final result / evidence |
| --- | --- |
| Type/lint/build | [Typecheck](final-typecheck.log), [lint](final-lint.log), [build](final-build.log) pass |
| Unit/integration | [87 tests, 23 files passed](final-core-suite.log) |
| Chromium E2E | [25 passed](final-e2e.log), including authenticated production/offline and lease race |
| Three desktop engines | [27 unique latest-pass scenarios](browser/combined-case-matrix.json), nine each Chromium 156.0.8078.48/Firefox 157/WebKit 27.2; union of initial and focused follow-ups, **not a single green 27-case run** |
| Accessibility/layout | [Final nine focused engine checks](browser/final-code-results.json); 36 axe states/engine, 108 total, zero automated violations; keyboard, zoom, motion and seven widths |
| Catalogue/source | [Fresh all-field/hash reconciliation](migration-verification.json): 36,569 entries, zero mismatches/rounding differences/FK violations, integrity ok; [three-source equality](../partavar/source-reconciliation.json) |
| Backup/restore | [Fresh isolated restore](restore-verification.json): 36,569 queryable rows, validated backup manifest, integrity ok, FK=0; [backup receipt](catalogue-backup.json) |
| Bundle | [135,584 B gzip all emitted HTML/CSS/JS](final-bundle.json), no private/legacy/catalogue cache leakage |
| Production app/offline | [Actual authenticated same-origin run](production/offline-authenticated.json), CSP/Worker/snapshots/offline relaunch, no errors; [credentialed install manifest](production/install-manifest.json), 192/512 icons, no browser manifest errors |
| Isolated install/relocation | [Fresh private candidate](tooling/clean-install-verification.json): 402 packages downloaded, 0 reused, new store/frozen lockfile, native SQLite 3.53.4/FTS5 trigram, 23 runtime checks; macOS arm64 only |
| Local TLS | [Caddy loopback TLS 1.3](tooling/local-tls-proxy.json): 21 checks, no public listener/DNS/ACME or OS trust change |
| Dependency advisory check | [Final advisory snapshot](dependency-audit-final.json): 0 reported vulnerabilities; does not prove absence of unknown vulnerabilities |
| Final delivery artifact | **Pending:** final ZIP extraction/inventory/hash/SQLite/source/snapshot receipt to be written beside the ZIP after artifact creation |

The isolated-install candidate preceded the final visual width-guard refinement. It proves the stated dependency/native/backend/relocation checks for that candidate; final UI is supported by the separate final build/browser results. Linux/systemd and the actual deployment host remain untested.

## Material source findings — all corrected and verified

### R1 — expired living installer downgraded an activated version

Pre-fix `apps/web/src/offline/installer.ts` renewed its 30-second lease before fetch, then wrote stage/chunk/status data without checking current ownership. Activation checked manifest identity only; catch marked the version failed unconditionally. A sleeping tab A could lose its lease, tab B activate the same immutable version, then A resume and overwrite ready as failed while the active pointer remained on it.

Confirmed with `tests/e2e/release-lease-race.spec.ts`: [red state](lease-race-red-state.json) had the active target and failed lease status. The fix fences stage/data/marker/state/activation/failure writes by the unexpired owner and protects a successor's ready record. [Final state](lease-race-state.json) is ready with no failure; the [final 25-case Chromium run](final-e2e.log) includes the passing race. The fixture changes only a disposable browser lease timestamp to model suspension; production SQLite is untouched.

### R2 — history badge crossed catalogue-version identity

Pre-fix `ui/entry.ts` tagged catalogue badges with a numeric entry ID only. `price-intelligence/workspace.ts` updated all matching IDs, checking version only when a version attribute happened to exist. An older saved package could recolor a hidden current search card sharing the surrogate ID; returning Search retained the wrong badge.

Required renderer versions, exact badge-version selection and pinned actions now preserve the ID+version contract. [Red regression](browser/history-version-red.log) is retained. `tests/release/history-version.spec.ts` and per-engine history-version reports pass in the [combined matrix](browser/combined-case-matrix.json), including family-card/action version coverage.

### R3 — open tabs ignored another tab's activation

Pre-fix the installer sent BroadcastChannel `activated` but no receiver refreshed an already-open tab's Worker status. Its stale local pointer kept issuing old-version requests, while offline search/detail/options rejected the changed active pointer; retry could not recover without reload/manual update.

Broadcast/focus/visibility refresh now reads shared local status, updates version/vehicle metadata, retains query text and invalidates stale rows. [Original red](browser/cross-tab-red.log) is retained; all three paths pass in all three engines in the [case matrix](browser/combined-case-matrix.json).

### R4 — genuine ResizeObserver feedback during price layout

The first persistent WebKit install/restart path exposed synchronous observer layout writes producing an undelivered-notification loop. A focused narrow-layout case reproduced it. Width guards and requestAnimationFrame writes fix the feedback. [Red output](browser/resize-red.log) and pre-fix offline evidence remain retained; [final layout/online/axe checks](browser/final-code-results.json) and [final persistent WebKit offline case](browser/final-webkit-offline-results.json) pass with zero page/console errors.

Additional implemented corrections cover focusable skip-link targets, visible-wordmark accessible naming, 200% container reflow, favicon, robots and authenticated install manifest/icons. See [browser release report](browser/browser-release-report.md), [manifest red](install-manifest-red.log) and [manifest green](install-manifest-green.log).

## Initial failures: distinguish source defects from harness/environment

The first cross-engine full run recorded 21 passed / 6 failed and is preserved. Firefox's inline `bdi` clientWidth=0 / scrollWidth=9 assertion was a harness error despite actual text containment; meaningful box/text rectangles replaced it. WebKit service workers bypassed intercepted tiny fixtures; routed fixtures now block SW while full actual offline tests retain it. WebKit ephemeral quota was truly 1,048,576,000 B and correctly rejected installation; a clean persistent profile with 20,615,843,021 B quota installed without override. Those cases do not justify claiming a successful ephemeral install. The ResizeObserver error was a genuine source bug and received a separate red→green fix. Original logs/results/traces are not presented as initial success.

## Private runtime boundary

The old development-only topology lacked operational authentication. Current same-origin runtime serves built public content through explicit allowlists and protects app/API/readiness/SW/install resources and snapshots with generated-token Basic authentication, exact origin/Host policy, sanitized errors and security/cache headers. Unauthorized snapshot/manifest revalidation cannot bypass authentication. Actual browser/CSP/offline and 21-check local TLS tests validate the stated boundary; no external host certification or public deployment follows.

Catalogue/source files remain outside public static roots. The real public preview was inspected and contains no private rows/codes/prices. Offline data is inherently readable to its device owner and cannot be revoked while disconnected. Local browser documents need their own exported JSON backups.

## Performance acceptance and honest measurements

The migration reference calls its budgets **“Proposed performance budgets (targets, NOT measured claims)”**. Warm exact-code/name/vehicle p95 targets are 150/300/300 ms; broad/short fallback is separate. Mandatory constraints still include truthful evidence, no initial complete catalogue transfer/hydration, Worker bulk work, bounded result pages and no bulk main-thread task above 50 ms on the benchmark workload.

[Fresh seven-sample browser timings](browser/performance-summary.json), after two warmups, meet proposed warm targets on this single macOS host: Chromium 11.4/19.6/12.9 ms; Firefox 3/12/12 ms; final WebKit 5/16/18 ms. Chromium/Firefox timings precede the final visual observer scheduling correction with search/Worker logic unchanged. Final WebKit full install took 99.061 s and its actual persistent process was closed/reopened offline. Chromium/Firefox release scenarios reopen a page; separate retained Chromium tests cover a full process restart.

Cold broad `150` remains slow: 9.181 s Chromium / 8.448 s final WebKit (Firefox 0.251 s). Installed whole-origin usage estimates are 1,293,180,348 / 1,160,020,562 / 737,120,969 B respectively. The reference sets no absolute installed-size cap and explicitly allows index/rollback growth. These values remain target-phone validation limitations. Chromium observed zero main-thread long tasks during measured install/search; Firefox/WebKit did not expose the API, so no zero-task claim is made for them.

Source review found 500-entry data batches, compact score candidates, bounded cache sets and full summaries only for the visible page; no full-catalogue main-thread startup array. Potential index/query improvements are not substitutes for retaining complete matching/counts or evidence-backed profiling.

[Final bundle gate](final-bundle.json) now covers **all emitted HTML/CSS/JS**, 135,584 B gzip. The 14,769 B entrypoint subtotal excludes dynamic app/Worker modules and includes website CSS; it is not full startup. [Actual final resource timing](browser/final-startup-resources.json): app 119,987 B encoded JS/CSS/Worker, site 21,244 B, plus 912 B HTML each; excludes SW bootstrap/images. See [performance report](../../docs/performance-report.md) for full scope. No controlled original-HTML or phone before/after improvement is claimed.

## Checklist definitions

- **Verified scoped:** fresh final evidence supports the item within its named environment.
- **Verified + prior artifact:** final regression/source gate plus retained earlier artifact supports that particular behavior.
- **Reviewed with limit:** source/artifact review supports the statement; absence of Git or external observation is explicit.
- **Blocked / not tested:** missing external input/environment, with a reason. It is never silently marked passed.


## Repository and source preservation

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Existing workspace inspected before changes. | Reviewed / verified scoped | [Three-source hashes/equality](../partavar/source-reconciliation.json), [fresh original SHA/all-field reconciliation](migration-verification.json); existing workspace retained. |
| Original legacy HTML archived unchanged. | Reviewed / verified scoped | [Three-source hashes/equality](../partavar/source-reconciliation.json), [fresh original SHA/all-field reconciliation](migration-verification.json); existing workspace retained. |
| Latest Windows v3.0.1 source preserved. | Reviewed / verified scoped | [Three-source hashes/equality](../partavar/source-reconciliation.json), [fresh original SHA/all-field reconciliation](migration-verification.json); existing workspace retained. |
| Latest Android v3.0.1 source preserved. | Reviewed / verified scoped | [Three-source hashes/equality](../partavar/source-reconciliation.json), [fresh original SHA/all-field reconciliation](migration-verification.json); existing workspace retained. |
| No unrelated user work overwritten. | Reviewed with limit | No Git baseline. Original SHA/full fields preserved; scoped changes and original/reference files retained; no blanket historical file-diff claim. |
| Private catalogue/source files excluded from public static assets. | Verified scoped | [Runtime/CSP/auth E2E](final-e2e.log), [bundle isolation](final-bundle.json), explicit static allowlists and inspected empty public preview; ZIP receipt separate/pending. |

## Catalogue migration

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Active source SHA recorded. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Exact row count recorded. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Full field-level reconciliation passes. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Technical/logistics identity separation verified. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Large price handling verified. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Vehicle memberships verified. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |
| Migration report created. | Verified scoped | [Fresh complete hashes/counts/prices/relationships](migration-verification.json), [migration report](../../docs/migration-report.md). |

## Search

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Both search modes implemented. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| All vehicle models reachable. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| Ranking regression tests pass. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| `-01` preference preserved correctly. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| Bounded pagination implemented. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| Server/offline search parity verified. | Verified scoped | [Search report](../../docs/search-verification.md), [core regressions](final-core-suite.log), [actual three-engine parity/version matrix](browser/combined-case-matrix.json). |
| Android custom suggestions preserved without intrusive native suggestion overlay. | Blocked / not tested | Physical Android/WebView/software keyboard unavailable; custom suggestions and input attributes tested on desktop engines/mobile widths. |

## Invoice

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Price modes implemented. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Manual price edit implemented. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Quantity/line/grand totals implemented. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| History implemented. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Print/PDF view implemented. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Excel export verified where supported. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Saved invoice prices remain snapshots after catalogue updates. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |
| Template architecture ready for later user-approved invoice design. | Verified scoped + prior artifact | [Invoice/print report](../../docs/invoice-print-verification.md), [final 25-case E2E](final-e2e.log), final three-engine exact manual-price/XLSX/preview; physical Android print untested. |

## Purchase lists / packages

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Purchase lists persist/reopen/export. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Smart Suggestions implemented from real catalogue data. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Package line price fields implemented. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Package line price is editable. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Package totals implemented. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Package -> invoice transfer preserves manual prices. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |
| Saved package lifecycle implemented. | Verified scoped + prior artifact | [Document lifecycle/snapshot/transfer evidence](../../docs/invoice-print-verification.md), final core/E2E and three-engine document checks. |

## Historical price intelligence

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Historical Excel importer implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Immutable source/import audit implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Ambiguous code matches reported, not guessed. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Price observations stored separately from current catalogue. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Trend summaries computed. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Green/yellow/red badge implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Neutral insufficient-history state implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Classification settings configurable. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Hover/focus/tap details implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Timeline/detail lazy loading implemented. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |
| Filtering/sorting implemented without cluttering default search. | Verified fixture scope | [Importer reconciliation/metrics/immutable audit](../../docs/price-history-import-report.md), final core/history E2E and version-badge regression; real company XLSX unavailable. |

## Offline/update

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| IndexedDB replica implemented. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Worker search implemented. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Service Worker shell implemented. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Atomic version activation implemented. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Interrupted update preserves old version. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Rollback procedure tested. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |
| Offline relaunch tested. | Verified scoped | [Final offline/lease/activation/rollback evidence](../../docs/offline-verification.md), full 36,569 rows in all engines, actual WebKit process restart; Firefox release check is page close/reopen. |

## PartAvar app UI/UX

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| PartAvar branding applied. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| UI UX Designer plugin actually used and documented. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| Mobile layout implemented. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| Desktop layout implemented. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| Light theme complete. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| Dark theme complete. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| No unintended horizontal overflow. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |
| Accessibility review completed. | Verified scoped review | [108 automated states + keyboard/layout](browser/browser-release-report.md), seven widths/two themes/three engines; manual screen reader/full WCAG 2.2 not tested. |
| Real screenshots captured. | Verified scoped / documented | [Final design review](../../docs/uiux/final-design-review.md), [fresh screenshots](browser/final-viewport-screenshots.json), final browser matrix; local UI UX skill provenance in existing reports. |

## Public website

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Website visually distinct from app. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| Home implemented. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| Product/features implemented. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| Offline/data-integrity content implemented. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| Support/contact implemented. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| App entry implemented. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| No fake testimonials/metrics/logos. | Verified scoped | [Browser final report](browser/browser-release-report.md), [actual public/auth boundary tests](final-e2e.log), real empty optimized preview; no invented contacts/testimonials. |
| No private data leakage. | Verified scoped | [Runtime/CSP/auth E2E](final-e2e.log), [bundle isolation](final-bundle.json), explicit static allowlists and inspected empty public preview; ZIP receipt separate/pending. |
| Responsive/accessibility review completed. | Verified scoped review | [108 automated states + keyboard/layout](browser/browser-release-report.md), seven widths/two themes/three engines; manual screen reader/full WCAG 2.2 not tested. |

## Tests and documentation

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| Lint passes. | Verified scoped | [Final lint](final-lint.log) |
| Typecheck passes. | Verified scoped | [Final typecheck](final-typecheck.log) |
| Unit tests pass. | Verified scoped | [Final core: 87 tests / 23 files](final-core-suite.log) |
| Integration tests pass. | Verified scoped | [Final core: 87 tests / 23 files](final-core-suite.log) |
| E2E tests pass for tested environments. | Verified scoped | [Final Chromium 25](final-e2e.log); [27 unique latest-pass matrix](browser/combined-case-matrix.json), multi-run union |
| Production build passes. | Verified scoped | [Final build](final-build.log), [bundle gate](final-bundle.json) |
| Performance measurements recorded. | Verified measured scope | [Final app/site startup, three-engine warm/cold/storage data](../../docs/performance-report.md); phone/controlled before-after not certified. |
| Run instructions documented. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |
| Import instructions documented. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |
| Backup/restore documented. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |
| Rollback documented. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |
| Known limitations listed. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |
| Untested environments listed honestly. | Reviewed / documented | [Operations](../../docs/operations.md), [release deployment](../../docs/release-deployment.md), [remaining work](../../REMAINING-WORK.md), fresh backup/restore and clean-install receipts. |

## Release safety

| Master checklist item | Current status | Evidence / limitation |
| --- | --- | --- |
| No public deployment performed without explicit authorization. | Reviewed / verified scoped | Local preparation only; no public deploy / push / published release / APK. Claims bounded by evidence; external limits listed. Final ZIP receipt pending. |
| No remote push/release performed without authorization when workspace policy requires it. | Reviewed / verified scoped | Local preparation only; no public deploy / push / published release / APK. Claims bounded by evidence; external limits listed. Final ZIP receipt pending. |
| No fake APK/native-device claim. | Reviewed / verified scoped | Local preparation only; no public deploy / push / published release / APK. Claims bounded by evidence; external limits listed. Final ZIP receipt pending. |
| No fake performance/accessibility claim. | Reviewed / verified scoped | Local preparation only; no public deploy / push / published release / APK. Claims bounded by evidence; external limits listed. Final ZIP receipt pending. |
| No TODO-only critical feature presented as finished. | Reviewed / verified scoped | Local preparation only; no public deploy / push / published release / APK. Claims bounded by evidence; external limits listed. Final ZIP receipt pending. |

## Remaining external inputs and final delivery status

- **Final ZIP/artifact verification pending:** the external sibling receipt will record the generated archive's trusted checksum and extraction/inventory/source/snapshot/database verification after creation. The expected archive is `deliverables/PartAvar-1.0.0-2026-10-28.zip`; frozen source documents are not rewritten after packaging. All other closed source cases above are verified within scope. [Central release report](../../docs/release-verification.md) explains the same artifact handoff boundary.
- Genuine company historical XLSX/date/unit mappings are unavailable; production observations remain unmanufactured, unknown history neutral. Fixture verification does not certify actual company workbook semantics or populated-history scale.
- Physical Android/WebView/software keyboard/native printing, low-end hardware, actual mobile quota/eviction/lifecycle and manual screen-reader validation remain untested. adb was absent and physical inventory unavailable.
- Actual Safari 18.3 refused WebDriver because remote automation is disabled. [Evidence](browser/safari-availability.json); no setting changed. Playwright WebKit does not certify Safari/iOS.
- Linux/systemd, final deployment-host runtime, public DNS/certificates/ACME and field performance require authorized operator checks. Local TLS / clean macOS install do not establish those external results.
- Final company invoice visual sample is not supplied; template fields remain configurable. No tax/legal assumptions were added.
- No public deployment, remote push, externally published release or APK claim follows from this acceptance report.

Canonical acceptance documents: [search](../../docs/search-verification.md), [offline](../../docs/offline-verification.md), [invoice/print](../../docs/invoice-print-verification.md), [performance](../../docs/performance-report.md), [component states](../../docs/uiux/component-states.md), [accessibility](../../docs/uiux/accessibility-review.md), [final design review](../../docs/uiux/final-design-review.md).

# Performance evidence and limits

Final review: 2026-10-28. These are measured desktop results from the declared environments. They are not controlled before/after improvement claims or certification of Android/low-end target performance.

## Bundle gate and actual startup

[Final bundle report](../reports/release-2026-10-28/final-bundle.json) passes the 250 KiB compressed-code target with **135,584 B gzip for all emitted HTML/CSS/JS**, including optional chunks and Workers. This conservative upper bound is the release size gate. Emitted JavaScript alone is 122,227 B gzip. No legacy literal/private files/catalogue API data are present in the frontend distribution or Service Worker precache.

The 14,769 B entrypoint subtotal includes HTML, all CSS and `assets/index-*.js`, omitting dynamic bootstrap/Worker code and including website CSS. It is explicitly a subtotal and must not be called complete app startup. The earlier 14,677 B figure used the same narrower calculation.

[Final fresh Resource Timing](../reports/release-2026-10-28/browser/final-startup-resources.json), isolated Chrome contexts after the observer fix:

| Route scope | Encoded JS/CSS/Worker body bytes | Decoded bytes | HTML body |
| --- | ---: | ---: | ---: |
| App, seven assets including catalogue Worker | 119,987 | 393,892 | 912 B |
| Public site, six JS/CSS assets | 21,244 | 82,804 | 912 B |

Vite preview served gzip. This sample excludes Service Worker bootstrap and images. No catalogue chunks were fetched at startup. HTTP transfer bytes including reported headers were 122,087 B app and 23,044 B site, excluding the separate navigation response.

## Local browser catalogue measurements

[Performance summary and full samples](../reports/release-2026-10-28/browser/performance-summary.json): seven sequential warm keydown-to-result DOM samples after two warmups per query. Includes local Worker work and UI rendering, excludes Playwright transport time. One shared macOS arm64 host; no CPU/network throttling or controlled hardware comparison.

| Engine | Full install | Origin storage usage estimate | Exact-code warm p95 | Name warm p95 | Vehicle/name warm p95 | First broad `150` query |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chromium 156.0.8078.48 | 23.442 s | 1,293,180,348 B | 11.4 ms | 19.6 ms | 12.9 ms | 9.181 s |
| Firefox 157.0 | 39.088 s | 1,160,020,562 B | 3 ms | 12 ms | 12 ms | 0.251 s |
| Playwright WebKit 27.2 | 99.061 s | 737,120,969 B | 5 ms | 16 ms | 18 ms | 8.448 s |

Warm cached broad-query p95 was 9.1/13/16 ms respectively; broad/short fallback has no fixed target in the reference. The 150/300/300 ms proposed warm targets were met on this host. Chromium/Firefox timings precede the final visual ResizeObserver scheduling correction, with Worker/search logic unchanged. WebKit values are from the final build and persistent process-restart run.

Cold broad lookup remains materially slow in Chromium/WebKit. The retained prior Chromium first-query sample was 6.358 s; new 8–9 s results supersede any suggestion that the first broad query is fast. Warm cache values do not hide that limitation.

Decoded snapshot content is 89,939,083 B in 1,103 bounded chunks. Installed index/rollback storage is larger and engine-dependent. The preflight 18× decoded estimate is a safety budget, not a guarantee. WebKit ephemeral quota of 1,048,576,000 B correctly refused installation; persistent real quota of 20,615,843,021 B allowed it without override.

Chromium supported Long Tasks API and observed **zero main-thread long tasks during the measured install/search workload**. Firefox/WebKit did not expose it; their empty arrays are not zero-task evidence. Chromium/Firefox release scenarios reopen a page within the browser context; retained separate Chromium tests and final persistent WebKit cover actual process close/restart.

## Server and history measurements

[Fresh API benchmark](../reports/release-2026-10-28/api-benchmark.json): Node 24.19.0, macOS arm64, Apple M4/10 cores; local Fastify injection via dedicated SQLite Worker; two warmups, seven samples, result limit 20. Exact p50/p95 4.44/4.64 ms, name 12.60/12.98 ms, vehicle/name 45.17/45.87 ms. Two-character code fallback 117.60/131.12 ms, reported separately. This excludes network/browser latency.

[Retained history benchmark](../reports/partavar/price-history-performance.json): 200 in-process 20-entry neutral-summary requests, p50 0.430/p95 0.579 ms. It had zero production batches and does not establish populated-history scale. The benchmark process RSS/heap values are not isolated browser memory attribution.

## Passed structural constraints and remaining limits

- Main-thread startup receives shell/metadata and bounded responses, with no complete catalogue array. Bulk install/index/search remains in the Worker; top-level pages contain at most 20 cards.
- Worker builds compact candidate scores and reads entry/part/name data in 500-entry batches; full summaries are constructed for the visible page. Cached candidate sets are bounded.
- No-op update downloads zero catalogue chunks; hashes/counts validate before atomic activation. Retained rollback versions intentionally consume storage.
- Reference values are proposed performance targets; accurate reporting and structural constraints remain mandatory. The measured desktop warm targets pass, while cold latency and installed storage remain explicit limitations.
- No controlled original-HTML baseline, low-end/Android/WebView measurements, actual mobile thermal/eviction tests or complete browser heap attribution were performed.
- DevTools/Lighthouse artifacts in the [browser report](../reports/release-2026-10-28/browser/browser-release-report.md) are automated lab snapshots, not field Core Web Vitals or accessibility certification.
- Final release artifact verification was pending at document finalization; the external sibling ZIP receipt closes that gate, as described in [the release audit](../reports/release-2026-10-28/spec-audit.md).

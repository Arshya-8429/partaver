# Browser release verification — 2026-10-28

**Final result: 27 unique scenarios validated, nine each in Chrome 156.0.8078.48, Firefox 157.0 and Playwright WebKit 27.2.** This is the union of the initial run and focused follow-ups, with the latest relevant successful result selected per scenario. It is not a single 27-case green run. The case-by-case source runs, durations and initial failures are retained in [combined-case-matrix.json](combined-case-matrix.json).

## Passed

- Online exact logistics identity, keyboard vehicle/part selection, lazy details and focus restoration; no catalogue chunks fetched during startup/online search.
- Browser-local package/invoice persistence, exact 20-digit manual unit price and quantity, XLSX read-back and HTML print preview in all three engines.
- Six public routes, both themes and widths 320/360/390/430/768/1024/1440; real robots.txt response; keyboard navigation, touch targets, reduced motion and 200% enlargement.
- Axe-core 4.14.0: 36 app/site/combobox/dialog/workspace states per engine, 108 state audits total, zero automated violations in the final focused run. This does not certify full WCAG conformance.
- Full 36,569-row catalogue installation and online/offline 11-entry exact-code parity in actual IndexedDB. Chromium/Firefox page-close relaunch; WebKit full process close/reopen using an isolated persistent profile with offline=true before navigation.
- Real two-tab activation notification plus focus/visibility fallback, stale rows invalidated, query text retained and next search using the new exact version.
- Retained document history with a reused numeric entry ID cannot recolor a current-version badge; family cards and history actions remain version-pinned.
- Final source: online/document smoke, axe and layout/pageerror gates passed in all three engines; persistent WebKit real offline run passed with zero pageerrors and console problems.

## Material fixes and evidence

| Issue | Criterion / impact | Severity | Fix / regression |
|---|---|---|---|
| App skip link did not transfer focus | WCAG 2.4.1 | P2 | Focusable main landmark; direct keyboard regression, initial-smoke.log → final-code-checks.log |
| Public wordmark name omitted its visible Latin text | WCAG 2.5.3 | P2 | Accessible label includes PartAvar; axe-before-fixes.json → final per-engine axe summaries |
| 200% zoom left narrow cards in desktop columns, making codes vertical | WCAG 1.4.4 / reflow | P2 | Container-width card layout; chromium-app-zoom-before.png → final-app/zoom captures and rectangle checks |
| History summary could apply to a reused ID from another catalogue version | Evidence identity | P2 | Required renderer version, exact badge version match and pinned action; history-version-red.log → per-engine history-version.json |
| Other tabs kept an obsolete active version | Multi-tab search availability | P2 | Worker status refresh on activated/focus/visibility; cross-tab-red.log → per-engine cross-tab reports |
| Price ResizeObserver changed its own observed height synchronously | Runtime error / resize feedback | P2 | Width guard and RAF layout writes; resize-red.log → final-code-checks.log + final-webkit-offline.log |
| Missing favicon caused Chrome 404 console error | Runtime polish | P3 | Local SVG icon and real 200/MIME check; initial-smoke.log → final-code-checks.log |

## Initial failures and harness/environment diagnosis

Initial full run: 21 passed, six failed. These results remain in initial-full-results.json and initial-full-suite.log; the legacy results.json/html folder also belongs to that initial diagnostic run.

- Firefox reported clientWidth=0 and scrollWidth=9 for normal inline bdi text whose actual 103.9px rectangle fit within its 116px cell. The measurement now checks scroll width only for measurable boxes and always checks text rectangle containment. Actual dimensions are preserved in firefox-price-dimensions-before.json.
- WebKit ephemeral contexts reported a real 1,048,576,000-byte quota, below the required estimate. The installer safely refused and retained online use. The persistent test profile reported a 20,615,843,021-byte quota; no quota override was used. See webkit-storage-diagnostic.json, webkit-persistent-storage-diagnostic.json and the initial failure screenshot/trace.
- WebKit service workers bypassed intercepted fixture requests, so tiny synthetic installs accidentally reached the real catalogue API. Routed fixture files now block service workers; actual full offline tests retain them. All four fixture regressions pass in targeted-webkit-fixtures.log.
- The first persistent WebKit data path completed, but caught genuine ResizeObserver loop errors. Those errors were reproduced by a narrow layout regression and fixed in source. Final runtime evidence is final-webkit-offline-results.json; pre-fix data is retained in webkit-offline-before-resize-fix.json.

## Measured performance

| Engine | Full install | Reported storage usage | Warm exact p95 | Warm part phrase p95 | Warm vehicle/part p95 |
|---|---:|---:|---:|---:|---:|
| chromium 156.0.8078.48 | 23.44 s | 1,293,180,348 B | 11.4 ms | 19.6 ms | 12.9 ms |
| firefox 157.0 | 39.09 s | 1,160,020,562 B | 3.0 ms | 12.0 ms | 12.0 ms |
| webkit 27.2 | 99.06 s | 737,120,969 B | 5.0 ms | 16.0 ms | 18.0 ms |

Seven warm sequential keydown-to-result DOM samples after two warmups per query. All proposed warm targets were met on this shared macOS host. Cold queries remain materially slower: the first broad three-character query was 9.181s in Chromium, 0.251s in Firefox and 8.448s in final WebKit. These are measured samples, not a controlled hardware benchmark or before/after claim. Chrome/Firefox timings precede the final visual observer scheduling change; Worker/search logic is unchanged. Full samples are in performance-summary.json and each engine-local-performance.json.

Chromium supported the Long Tasks API and observed zero main-thread long tasks during installation/search. Firefox and WebKit did not expose that API; no zero-long-task claim is made for them.

Final fresh Chrome startup Resource Timing: initial app JS/CSS/Worker 119,987 bytes encoded (gzip), site 21,244 bytes; HTML 912 bytes each. This sample excludes SW bootstrap and images. See final-startup-resources.json. The repository bundle gate supplies the separate conservative all-code gzip budget.

## Remaining environment limits

- Actual Safari functional testing is blocked: safaridriver found Safari 18.3, but a fresh session was refused because remote automation was disabled. No settings changed. See safari-availability.json. WebKit engine testing does not establish actual Safari/iOS compatibility.
- Physical Android, Android WebView, low-end target hardware and manual screen-reader testing were not performed. adb was absent on PATH and standard SDK locations, so connected devices could not be enumerated. See environment.json.
- Firefox/Chromium release scenarios close/reopen a page; existing separate Chromium tests cover full process restart. The final WebKit case performs actual process restart.
- No company history file was supplied or invented. Historical fixtures are explicitly synthetic and only browser-local or intercepted; production catalogue/history were not mutated by these release tests.

## Viewport evidence

The requested exact viewport PNGs use 390×844 and 1440×1000 with fullPage=false, both themes: final-app-light-390.png, final-app-dark-390.png, final-app-light-1440.png, final-app-dark-1440.png. Two extra 390px first-result views show the complete code/price card. Metadata is in final-viewport-screenshots.json.

## Reproduction

Run `pnpm exec playwright install firefox webkit`, build the application, then `pnpm exec playwright test --config playwright.release.config.ts`. The release config reuses localhost API8787/preview4173 where available and writes isolated release evidence. The WebKit full catalogue test uses a temporary persistent profile that is removed after verification. Routed synthetic fixtures block service workers; real offline tests retain them.

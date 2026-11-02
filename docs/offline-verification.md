# Offline and update verification

Final source review: 2026-10-28. The verified offline paths below use actual browser IndexedDB/Workers and the migrated catalogue. Final release artifact verification remains a separate gate in [spec-audit.md](../reports/release-2026-10-28/spec-audit.md).

## Passed

`PartsFinderCatalogue` is a read-only versioned Dexie replica. Install/index/search run in a dedicated Worker. The Service Worker precaches a finite app shell, excludes API/history/catalogue responses from generic caching and verifies actual shell presence separately from catalogue readiness.

| Requirement | Evidence |
| --- | --- |
| Complete verified install | [Three-engine matrix](../reports/release-2026-10-28/browser/combined-case-matrix.json): full 36,569 rows, snapshot SHA/count checks, same 11-entry query parity |
| Offline relaunch | Chromium/Firefox page close/reopen in the live context; final WebKit full browser process closed/reopened from isolated persistent profile, offline before navigation |
| Existing Chromium full-process recovery | `offline-faults.spec.ts`, [retained fault report](../reports/partavar/offline-faults.json), final 25-case Chromium suite |
| Atomic version activation | Ready pointer transaction after validation; [final lease state](../reports/release-2026-10-28/lease-race-state.json) and regression in [final E2E log](../reports/release-2026-10-28/final-e2e.log) |
| Living stale owner excluded | Every stage/chunk/marker/state/activation/failure write is ownership-fenced; old owner cannot downgrade successor's ready version |
| Cross-tab activation recovery | Broadcast plus focus/visibility fallback refresh Worker status, update metadata/vehicle state and invalidate stale search rows |
| Interrupted/corrupt/quota candidate | Final E2E fault tests preserve old active version; corrupt chunk and preflight failures do not activate partial data |
| Resume and bounded batches | Verified marker and chunk data commit together; at most 500 records per chunk, 512 KiB decoded cap |
| No-op update | Unchanged version downloads zero catalogue chunks |
| Server rollback/backup restore | Final core suite; [fresh restore verification](../reports/release-2026-10-28/restore-verification.json): 36,569 rows, integrity `ok`, FK=0, isolated restored query |
| Authenticated production origin | [Actual production offline run](../reports/release-2026-10-28/production/offline-authenticated.json): real snapshot, CSP/credentials, offline relaunch, no errors |
| Install manifest | [Credentialed browser manifest](../reports/release-2026-10-28/production/install-manifest.json): no browser errors, 192/512 icons; native device installation not claimed |

The final core suite passed 87 tests/23 files; final Chromium E2E passed 25. Cross-engine evidence is a union of initial and focused runs, with 27 unique latest-pass scenarios; it is not a single green 27-case run. See [browser release report](../reports/release-2026-10-28/browser/browser-release-report.md).

## Actual storage and installation limits

[Performance summary](../reports/release-2026-10-28/browser/performance-summary.json) records install/whole-origin storage estimates: Chromium 23.442 s / 1,293,180,348 B; Firefox 39.088 s / 1,160,020,562 B; final persistent WebKit 99.061 s / 737,120,969 B. The decoded snapshot is 89,939,083 B. Storage engines, indexes and retained versions make download size different from installed usage. Preflight reserves an estimated 18× decoded size; it is not a universal guarantee.

WebKit ephemeral context had a genuine 1,048,576,000 B quota and correctly refused the full install. A clean persistent profile reported 20,615,843,021 B quota and installed without a quota override. Small intercepted WebKit fixtures initially bypassed route handlers through active service workers; those synthetic tests now block service workers, while full real offline tests retain them. These were environment/harness distinctions, not reasons to claim a successful ephemeral install.

A genuine synchronous price ResizeObserver feedback error was reproduced and fixed with width guards/RAF writes. Final WebKit full install/process-restart/offline search reports zero page/console errors; [pre-fix evidence](../reports/release-2026-10-28/browser/resize-red.log) is retained.

## Failed / blocked / not tested

- No open source failure remains in the scoped offline gate. The earlier red lease/history/observer and initial harness outputs are preserved.
- Physical Android/WebView, real quota/eviction, low-memory OS termination, actual disk exhaustion/power loss and native PWA installation are not tested.
- Actual Safari automation is blocked by its existing setting. WebKit/macOS does not certify Safari/iOS or Android behavior.
- Offline data remains readable on the device and cannot be revoked from a disconnected device. Browser documents require separate JSON backup before clearing storage.
- Target-host Linux/systemd, public DNS/TLS issuance and the actual deployed environment require authorized operator verification. Local authenticated runtime and [21-check loopback TLS proxy test](../reports/release-2026-10-28/tooling/local-tls-proxy.json) establish their stated scope only.

Run/update/backup/rollback instructions are in [operations](operations.md) and [release deployment](release-deployment.md). `file://` is not the supported PWA origin.

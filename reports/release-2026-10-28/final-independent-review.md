# Independent release review — 2026-10-28

## Review basis and scope

Read-only review of the release preparation against docs/release-readiness-plan.md, docs/partavar/implementation-plan.md (including its exact Review focus), the master final checklist and reports/release-2026-10-28/spec-audit.md. The baseline ZIP SHA-256 was independently recomputed as **2072d8b33ce1f81017c6564e968e3251073cd8646e0a01dec313cc725f60c27b**. Review input: review-input.json and review-source.diff (39 source/config/test files). No Git repository exists; no Git state was created or changed.

Inspected access/static/server code, credential generation, deployment examples, release package/manifest/source/snapshot verification, backup relocation, installer mutations, cross-tab refresh, version-qualified history badges, affected UI and browser/integration regressions. Reviewed surrounding Worker, service-worker, search/detail lifecycle and operational instructions where needed. During review Caddy formatting, the browser geometry assertion and the robots regression changed; these differences were inspected. The executor is still adding PWA icons/credentialed manifest loading and robots routing; their final source/build and final consolidated reports require the closing check below.

Only this report is written by the reviewer. Two independent disposable checks ran: a real Fastify/access-hook path-variant probe and a temporary headless Chromium manifest-fetch fixture. Neither used production SQLite, changed application source, rebuilt outputs, or reran the full browser suite.

## Strengths

- Production authentication is checked before private routes, with a generated high-entropy token verifier, constant-time token comparison, Host/Origin checks, bounded credential parsing and sanitized logging. The explicit static route set does not expose source/data directories.
- Lease ownership and expiry are checked inside the same IndexedDB transaction as protected stage/chunk/marker/activation mutations. A stale owner cannot mark a successor's ready version failed. Cross-tab notifications re-read the authoritative Worker status and invalidate stale visible results.
- Historical badges now carry the catalogue version along with the numeric entry ID; family-detail cards and retained document history follow the same identity boundary.
- Packaging uses online SQLite backups, excludes transient sidecars, verifies a staged candidate before atomic no-overwrite publication, and checks file inventory, source roundtrip, snapshot descriptors/chunk bytes and snapshot reconstruction. Relocation retains original audit metadata while locating archived source bytes by their recorded hash.
- Regression coverage includes committed WAL data, corrupt/tampered inputs, no overwrite, relocation, real browser IndexedDB races and exact large-price XLSX read-back. Public deployment, company history and physical-device claims are explicitly bounded in the new deployment guide.

## Issues

### Critical — Must Fix

None found in the reviewed release changes.

### Important — Should Fix

1. **The browser cannot fetch the authenticated PWA manifest with the current link.** File: apps/web/index.html:2; related access boundary: apps/api/src/access.ts:33. The link has no crossorigin=use-credentials while /manifest.webmanifest requires Basic authentication. In the independent Chromium fixture, /app/ authenticated successfully (401 challenge then 200), but the browser's own manifest request omitted Authorization and received 401. CDP Page.getAppManifest returned an empty data string and display=kUndefined. Adding crossorigin=use-credentials to the same fixture produced an authenticated 200 and the parsed application name/display=kStandalone. Ordinary fetch(), SW cache.addAll() and an offline-ready badge do not prove this native manifest fetch works. Add the attribute and retain a real browser manifest regression under production authentication. The executor has been notified and owns the fix. The reviewed manifest also lacks the 192/512 app icons needed for the intended installability; the executor independently identified that gap and is adding the existing brand artwork. Physical Android installation remains untested after either fix.

2. **The shipped operations guide still contradicts the new runtime and verification scope.** File: docs/operations.md:117,120,124. It calls the old entrypoint/CSS subtotal the initial shell, lists Firefox and all TLS/reverse-proxy work as untested, and states authentication is not implemented. The latter contradicts both the implementation and docs/release-deployment.md. Reproduction is reading the primary runbook after following its setup instructions: the operator receives mutually incompatible access/deployment guidance. Replace the stale current-state claims with final evidence and distinguish retained 2026-10-27 observations from the release checks. The executor already owns this final documentation consolidation; no additional approval or redesign is required.

### Minor — Nice to Have

No separate minor finding warrants extra release work.

## Verification evidence reviewed

- Independent path probe: /api/v1/catalog/manifest, encoded api/app prefixes and encoded separators, duplicate slashes, uppercase path, dot-path variants, trailing slash and encoded query delimiter. Private route matches returned 401; nonmatching variants returned 404; none returned the fixture private body.
- Independent Chromium manifest experiment: missing credentials attribute => manifest401/empty parsed data; attribute present => manifest200/standalone. Disposable synthetic credentials only; no private catalogue used.
- Existing fresh core-suite.log records 84 tests across 22 files before the later relocation regression; tooling/relocation-green.log is separate evidence for that addition. This is not represented as a reviewer rerun of the full suite.
- production/offline-authenticated.json records an actual catalogue install, offline relaunch and two search results with no page errors; lease-race-state.json records ready status and no failure after the stale owner resumes.
- tooling/local-tls-proxy.json records 21 local Caddy/TLS checks with an explicit temporary CA, including authenticated snapshot checksum and denied private paths. It explicitly excludes public DNS/ACME, OS trust changes and real systemd installation.
- final-bundle.json uses the corrected all-emitted-code bound. dependency-audit-final.json has zero reported advisories; that is not proof of universal dependency security.

## Recommendations and closing gates

Apply the manifest fix and app icons, close the contradictory runbook statements, inspect their final diff, and run the appropriate focused production manifest/static tests plus the already planned final build/checks. Complete the planned browser-suite disposition and manifest/source reconciliation, then generate and independently verify the final ZIP using its trusted external SHA-256. A code review of packaging logic is not a verification of a ZIP that has not yet been generated.

## Declined to judge

Every considered behavior set aside from this release-change verdict is listed here; these are explicit limits, not silent passes.

- Real historical company workbook mapping, effective dates and approval: no genuine company XLSX was supplied; fixture importer evidence cannot certify it.
- Physical Android/WebView software keyboard, add-to-home-screen installation, process eviction, storage quota and native print/PDF behavior: no target device is available; desktop emulation and Chromium manifest parsing are narrower evidence.
- Actual Safari/iOS behavior: the WebKit automation engine is not certification of the installed Safari product or iOS lifecycle.
- Screen-reader interoperability and full WCAG 2.2 conformance: automated rules, focus/keyboard and enlargement checks cannot establish these without the relevant manual environments.
- Real public DNS, certificate issuance, production proxy/firewall and systemd sandbox behavior: only local runtime/proxy preparation is authorized; final host acceptance remains an operator gate.
- Remote revocation or encryption of already downloaded catalogue/browser documents: persistent authorized offline access is the accepted product model and is documented; server token rotation cannot erase an offline device.
- Multi-user roles, account recovery, browser-independent Basic-auth logout and cross-device document sync: not promised by the accepted single-operator/local-document design.
- Hardware-independent latency, low-end phone capacity and performance improvement against legacy: current measurements have a declared single-host scope; no equivalent legacy benchmark or target hardware was supplied.
- Abrupt physical power loss, disk-full failure and adversarial filesystem writers: not reproduced by this review; online backups and transactional tests do not certify those environments. Deployment assumes trusted local release/data ownership.
- A full security audit or proof that no future dependency vulnerability exists: this is a bounded release code review, with the recorded advisory result only.
- A public release, remote push or APK: explicitly outside the authorized preparation scope; none was performed by this reviewer.

## Assessment

**Ready to merge/release preparation: With fixes.** The central auth/static, offline ownership and packaging designs are coherent, and no critical defect was found in the inspected changes. The confirmed native manifest-auth failure and stale operator guidance must be closed; final PWA assets, full verification evidence and the produced release ZIP must pass their remaining gates before the executor declares the deliverable ready.

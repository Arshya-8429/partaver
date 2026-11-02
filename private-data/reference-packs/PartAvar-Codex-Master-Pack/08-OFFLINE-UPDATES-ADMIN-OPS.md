# PartAvar - Offline, Updates, Import Operations, Backup and Rollback

## 1. Catalogue offline model

Catalogue replica is read-only in the browser.

The backend/versioned release pipeline remains authoritative.

Do not implement multi-master catalogue synchronization.

---

## 2. Offline readiness states

Use the previous state machine:

- `empty`
- `downloading`
- `importing`
- `indexing`
- `validating`
- `ready`
- `failed`

Connectivity and offline readiness are different concepts.

Do not show "offline ready" until both app shell and local catalogue are verified.

---

## 3. Atomic update process

For catalogue updates:

1. fetch/revalidate manifest,
2. stage a new immutable version,
3. download bounded chunks,
4. validate checksums/counts,
5. import in short transactions,
6. build indexes,
7. run validation fixtures,
8. atomically switch active version,
9. retain previous valid version for rollback,
10. clean obsolete versions only under explicit lifecycle rules.

Never destroy the active version before a replacement validates.

---

## 4. Failure handling

Test:

- network interruption,
- corrupt chunk,
- quota failure,
- browser close/crash,
- stale installer lock,
- concurrent tabs,
- incompatible schema,
- cancellation.

A failed update must leave the old catalogue usable.

---

## 5. Historical Excel import operations

Historical price imports must be controlled operations.

Preferred options:

- authenticated admin workflow if secure auth/admin is already implemented,
- otherwise local CLI/import operator tooling.

Do not expose unauthenticated file-upload/write endpoints merely for convenience.

Import flow:

1. source file hash,
2. parse/preview,
3. column mapping,
4. effective-date confirmation,
5. match/reconciliation preview,
6. ambiguity report,
7. explicit commit,
8. recompute price-history summaries,
9. publish changed summaries,
10. record import report.

---

## 6. Current catalogue import

Current catalogue update/import remains separate from historical observation import.

Never use a historical file to overwrite the active catalogue unless the operator explicitly identifies it as a new authoritative current-price catalogue and the standard catalogue migration validation passes.

---

## 7. Backup

Document and automate backups for:

- SQLite catalogue DB,
- operational documents DB/data,
- historical price observations,
- source archives,
- release manifests/snapshots,
- configuration excluding secrets.

Include restore verification, not only backup creation.

---

## 8. Rollback

Provide explicit commands/procedures to:

- roll back active catalogue version,
- restore a database backup,
- revert a failed price-history import batch where safe,
- restore the previous application build.

Historical observations should generally be immutable; corrections should create superseding/audited operations rather than silently editing source evidence.

---

## 9. Operational status UI

Show useful, honest status:

- active catalogue version,
- last successful catalogue update,
- offline-ready state,
- update available/in progress,
- last historical-price import summary for authorized operator view,
- error/retry state.

Do not expose private filesystem paths, raw stack traces, or secrets.

---

## 10. Deployment assumptions

Prepare separate configuration for:

- local development,
- private/shared production.

Prefer same-origin website/app/API/snapshot distribution where practical.

If authentication is added later, ensure Service Worker caches do not accidentally cache private auth responses as public app shell data.

Do not deploy publicly without explicit user authorization.

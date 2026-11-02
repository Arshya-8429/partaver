# PartAvar - Testing, Acceptance, Performance, and Evidence

## 1. General rule

A feature is not complete because the code exists.

It is complete only when the relevant tests/evidence pass.

Do not claim success without actual command output and environment notes.

---

## 2. Migration tests

Verify:

- full catalogue row count for the active source,
- full per-row field/hash reconciliation,
- all raw codes retained,
- leading zeroes retained,
- 64-bit-safe price handling,
- model memberships retained,
- aliases/friendly/replacement retained,
- technical/logistics identities not conflated,
- repeated import idempotence,
- failed import does not replace active version.

Use original baseline counts only if source hash matches the original reference.

---

## 3. Search tests

Cover:

- exact technical code,
- exact logistics code,
- Persian/Arabic digits,
- part phrase exact/start/contains,
- aliases,
- replacement search semantics,
- `-01` preference without filtering siblings,
- shared technical code with different logistics prices,
- shared technical code with different model fitment,
- 1-2 character search,
- rapid query cancellation,
- no result,
- pagination without duplicate/missing entries,
- server/offline ordering equivalence.

---

## 4. Vehicle tests

Verify:

- preferred models,
- all `others`/raw models reachable,
- family shortcuts,
- X33 Cross CVT/MT distinction,
- Tiggo 7 Pro Max AWD naming rule,
- Arrizo/Tiggo/FX variants,
- no trim collapse by fuzzy naming,
- keyboard and touch selection,
- clear/reset.

---

## 5. Smart Suggestions tests

Verify:

- application suggestions remain enabled,
- mobile native/browser keyboard suggestions do not replace/cover app suggestions on tested targets,
- only real catalogue records suggested,
- vehicle filtering,
- ambiguous code selection,
- 2-5 item cap,
- no-reliable-suggestion state,
- add single/all certain,
- package persistence.

---

## 6. Invoice tests

Verify:

- all price modes,
- exact +10/+20 derivation,
- custom percentage,
- manual unit-price edit,
- quantity,
- line total,
- grand total,
- save/reopen/duplicate/delete history,
- catalogue update does not change saved invoice line price,
- print/PDF layout,
- Excel output where enabled,
- RTL/LTR code integrity,
- large price values.

Capture a sample invoice PDF/print screenshot generated from test fixtures.

Do not claim native Android PDF success unless tested in the actual wrapper/device environment.

---

## 7. Package tests

Verify:

- price fields on package lines,
- editable unit price,
- package total,
- saved/reopened package,
- smart suggestion add,
- exact logistics entry preservation,
- package -> invoice transfer preserves chosen prices,
- optional price refresh requires explicit user confirmation if implemented.

---

## 8. Historical price tests

Verify:

- Excel parsing,
- source SHA audit,
- exact logistics matching,
- ambiguous technical-only row handling,
- date missing state,
- duplicate import behavior,
- observations ordered correctly,
- cumulative change calculation,
- configurable threshold classification,
- percentile classification if enabled,
- green/yellow/red states,
- neutral insufficient-history state,
- detail timeline,
- sort/filter,
- history import cannot overwrite current catalogue price.

---

## 9. Offline/update tests

Test in real browser IndexedDB:

- first install,
- offline relaunch after full close,
- local search parity,
- update available,
- unchanged version downloads zero catalogue chunks,
- interrupted update,
- corrupt hash,
- quota failure,
- concurrent tabs,
- crash/recovery,
- previous valid version retained,
- atomic activation,
- rollback.

---

## 10. UI/UX tests

Both themes.

Widths:

- 320
- 360
- 390
- 430
- 768
- 1024
- 1440

Check:

- no page-level horizontal overflow,
- no clipped price/code,
- mobile keyboard layout,
- focus order,
- combobox semantics,
- dialog/sheet focus restoration,
- Escape/back behavior,
- reduced motion,
- zoom/text enlargement,
- color contrast,
- no accidental white/dark surfaces in wrong theme.

---

## 11. Public website tests

Check:

- routes,
- responsive navigation,
- real application screenshots,
- no private catalogue/static leakage,
- metadata,
- keyboard navigation,
- image optimization,
- build size,
- no broken links,
- application CTA route.

---

## 12. Performance evidence

Measure, do not guess.

Record at minimum:

- app initial JS/CSS bundle bytes,
- website initial bundle bytes,
- initial catalogue snapshot transfer bytes,
- installed IndexedDB size,
- representative exact-code latency,
- part-name search latency,
- vehicle-filtered search latency,
- historical badge summary query latency,
- main-thread long tasks during search/update,
- memory snapshot where practical.

Use the same machine/browser/catalogue version for before/after comparisons.

---

## 13. Required verification documents

Deliver:

- `docs/migration-report.md`
- `docs/search-verification.md`
- `docs/offline-verification.md`
- `docs/price-history-import-report.md`
- `docs/invoice-print-verification.md`
- `docs/performance-report.md`
- `docs/uiux/verification-report.md`
- `docs/operations.md`

Each report must separate:

- passed,
- failed,
- not tested,
- blocked.

No ambiguous "looks good" verification.

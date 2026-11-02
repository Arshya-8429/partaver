# PartAvar - Final Delivery Checklist

Do not declare the project complete until every mandatory item below is either verified or explicitly marked blocked/not tested with a reason.

## Repository and source preservation

- [ ] Existing workspace inspected before changes.
- [ ] Original legacy HTML archived unchanged.
- [ ] Latest Windows v3.0.1 source preserved.
- [ ] Latest Android v3.0.1 source preserved.
- [ ] No unrelated user work overwritten.
- [ ] Private catalogue/source files excluded from public static assets.

## Catalogue migration

- [ ] Active source SHA recorded.
- [ ] Exact row count recorded.
- [ ] Full field-level reconciliation passes.
- [ ] Technical/logistics identity separation verified.
- [ ] Large price handling verified.
- [ ] Vehicle memberships verified.
- [ ] Migration report created.

## Search

- [ ] Both search modes implemented.
- [ ] All vehicle models reachable.
- [ ] Ranking regression tests pass.
- [ ] `-01` preference preserved correctly.
- [ ] Bounded pagination implemented.
- [ ] Server/offline search parity verified.
- [ ] Android custom suggestions preserved without intrusive native suggestion overlay.

## Invoice

- [ ] Price modes implemented.
- [ ] Manual price edit implemented.
- [ ] Quantity/line/grand totals implemented.
- [ ] History implemented.
- [ ] Print/PDF view implemented.
- [ ] Excel export verified where supported.
- [ ] Saved invoice prices remain snapshots after catalogue updates.
- [ ] Template architecture ready for later user-approved invoice design.

## Purchase lists / packages

- [ ] Purchase lists persist/reopen/export.
- [ ] Smart Suggestions implemented from real catalogue data.
- [ ] Package line price fields implemented.
- [ ] Package line price is editable.
- [ ] Package totals implemented.
- [ ] Package -> invoice transfer preserves manual prices.
- [ ] Saved package lifecycle implemented.

## Historical price intelligence

- [ ] Historical Excel importer implemented.
- [ ] Immutable source/import audit implemented.
- [ ] Ambiguous code matches reported, not guessed.
- [ ] Price observations stored separately from current catalogue.
- [ ] Trend summaries computed.
- [ ] Green/yellow/red badge implemented.
- [ ] Neutral insufficient-history state implemented.
- [ ] Classification settings configurable.
- [ ] Hover/focus/tap details implemented.
- [ ] Timeline/detail lazy loading implemented.
- [ ] Filtering/sorting implemented without cluttering default search.

## Offline/update

- [ ] IndexedDB replica implemented.
- [ ] Worker search implemented.
- [ ] Service Worker shell implemented.
- [ ] Atomic version activation implemented.
- [ ] Interrupted update preserves old version.
- [ ] Rollback procedure tested.
- [ ] Offline relaunch tested.

## PartAvar app UI/UX

- [ ] PartAvar branding applied.
- [ ] UI UX Designer plugin actually used and documented.
- [ ] Mobile layout implemented.
- [ ] Desktop layout implemented.
- [ ] Light theme complete.
- [ ] Dark theme complete.
- [ ] No unintended horizontal overflow.
- [ ] Accessibility review completed.
- [ ] Real screenshots captured.

## Public website

- [ ] Website visually distinct from app.
- [ ] Home implemented.
- [ ] Product/features implemented.
- [ ] Offline/data-integrity content implemented.
- [ ] Support/contact implemented.
- [ ] App entry implemented.
- [ ] No fake testimonials/metrics/logos.
- [ ] No private data leakage.
- [ ] Responsive/accessibility review completed.

## Tests and documentation

- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E tests pass for tested environments.
- [ ] Production build passes.
- [ ] Performance measurements recorded.
- [ ] Run instructions documented.
- [ ] Import instructions documented.
- [ ] Backup/restore documented.
- [ ] Rollback documented.
- [ ] Known limitations listed.
- [ ] Untested environments listed honestly.

## Release safety

- [ ] No public deployment performed without explicit authorization.
- [ ] No remote push/release performed without authorization when workspace policy requires it.
- [ ] No fake APK/native-device claim.
- [ ] No fake performance/accessibility claim.
- [ ] No TODO-only critical feature presented as finished.

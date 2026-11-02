# PartAvar execution plan

Spec: `private-data/reference-packs/PartAvar-Codex-Master-Pack/00-MASTER-CODEX-EXECUTION-PROMPT.md` and its ordered documents 01–10 and references. User authorized implementation on 2026-10-27 after the complete reading/comparison phase.

## Preserved foundation

Existing Fastify/SQLite/Vite/Dexie/Worker implementation and migrated catalogue remain authoritative. Source references are preserved under private-data. No Git repository exists here; use dated code/data checkpoints instead of creating a new repository or replacing the workspace.

## Tasks and interfaces

1. Preserve source pack and code/data backups. Reconcile all three HTML catalogues field by field; retain active catalogue if identical. Evidence: `reports/partavar/source-reconciliation.json`.
2. Operational documents: pure domain `DocumentLine` snapshot and BigInt calculations; a separate browser IndexedDB database for mutable invoice/purchase/package documents and settings. Catalogue remains read-only. Document export/import provides an explicit portable backup and legacy import path. Implement invoice history, editable prices/quantity, package lifecycle, price-preserving transfer, true XLSX export and dedicated A4 print surface.
3. Historical prices: separate local SQLite operations database, immutable source batches/observations and CLI-only imports. Existing catalogue is never overwritten. Typed bounded read routes provide summaries/timelines/filtering. No unauthenticated import/write endpoint.
4. Related suggestions: pure rules plus bounded real catalogue queries, exact logistics choices, 2–5 targets, vehicle scope and no global fallback for an assigned vehicle. Migrate real v3 rule definitions; replace technical-code-only dedup with logistics identities.
5. App integration: PartAvar text wordmark, /app route, compact navigation, search + custom part suggestions (no native datalist), add-to-document actions, document workspaces, settings and lazy price badges/history. Keep 20/10/10 limits, both themes and prior search ordering.
6. Public site: separate routed experience at /, /product, /features, /offline-data, /support, /contact; real /app CTA. No invented contact/company facts or login. Share tokens; use real empty-app screenshots with no private prices in public assets.
7. Verify: regression tests before critical changes; focused tests then full lint/typecheck/unit/integration/build/bundle/E2E. Actual source/database reconcile, offline/corruption/quota/update tests, real PDFs/XLSX read-back, screenshots, performance, source/static boundary and backup restore.
8. Final review and delivery: apply actual local UI UX Designer skill methods to both surfaces, fresh code review, fix material findings, reports and status for every item in 10-FINAL-DELIVERY-CHECKLIST.md. Explicitly label physical Android, real historical company spreadsheets, screen readers or unavailable deployment environments not tested. No public deploy/push/APK.

## Decisions

- Mutable documents remain local to the operator's browser (offline capable), in a separate IndexedDB database. There is no multi-device sync claim. Backup/import is explicit and documented. The backend's new SQLite database stores historical evidence, not the read-only catalogue.
- No historical company Excel file was supplied. Implement importer and test real generated workbook fixtures, clearly labelled test evidence; production badges stay neutral until trusted data is imported.
- The public contact route shows truthful configuration/setup guidance until actual contact details are provided; it never sends messages or fabricates a contact address.
- Existing compact blue/neutral UI direction is extended under the newly authorized scope; do not restart a proposal-only approval loop. Prepare app/site design specs before their implementation.

## Review focus

Sibling logistics identities in saved documents/suggestions/history; manual price retention; exact money and formula-safe XLSX; source dates and ambiguous historical matches; read-only catalogue; bounded/offline queries; app/site/private boundary; destructive document actions require confirmation; origin/legacy migration limits are explicit.

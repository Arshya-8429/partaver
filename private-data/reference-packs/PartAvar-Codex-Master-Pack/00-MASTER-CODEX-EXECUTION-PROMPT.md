# PartAvar - Master Codex Execution Prompt

## Mission

Transform the existing PartsFinder workspace into **PartAvar**, a professional Persian RTL automotive-parts web platform with a public website and a production-grade operational application.

This is an **implementation task**, not a request for another architecture proposal.

You are receiving a ZIP pack containing:

- the original legacy PartsFinder HTML source,
- the latest Windows and Android v3.0.1 Smart Suggestions HTML references,
- the previous lossless migration architecture specification,
- the previous UI/UX redesign specification,
- and a new set of PartAvar implementation prompts.

Read the complete pack before changing code.

Communicate with the user in **Persian**. Keep code, filenames, technical documentation identifiers, database names, API route names, and commit-quality engineering notes in English.

---

## 1. Required read order

Read these files in this exact order:

1. `00-MASTER-CODEX-EXECUTION-PROMPT.md`
2. `01-PARTAVAR-PRODUCT-SCOPE.md`
3. `02-ARCHITECTURE-DATA-MIGRATION.md`
4. `03-CATALOGUE-SEARCH-VEHICLES.md`
5. `04-INVOICE-PURCHASE-PACKAGES.md`
6. `05-PRICE-HISTORY-INTELLIGENCE.md`
7. `06-APP-UI-UX-REDESIGN.md`
8. `07-PUBLIC-WEBSITE-UI-UX.md`
9. `08-OFFLINE-UPDATES-ADMIN-OPS.md`
10. `09-TESTING-ACCEPTANCE-DELIVERY.md`
11. `10-FINAL-DELIVERY-CHECKLIST.md`
12. `references/PartsFinder-Codex-Migration-Plan.md`
13. `references/PartsFinder-UI-UX-Designer-Redesign-Prompt.md`
14. `references/source-inventory.json`
15. inspect all files under `source/`

Do not skim only the summaries. The old architecture pack contains important migration, identity, search, offline, and rollback constraints that remain binding unless explicitly overridden by this new pack.

---

## 2. Source hierarchy and conflict resolution

The project has three important source references:

- `source/PartsFinder_Android-28_original.html`
  - original monolithic baseline used by the previous migration plan.
- `source/PartsFinder_Windows_v3_0_1.html`
  - latest desktop feature reference before online/password/extension experiments.
- `source/PartsFinder_Android_v3_0_1.html`
  - latest mobile feature reference before APK/importable-wrapper experiments.

### Data authority

The original catalogue identity and migration rules remain authoritative.

Before import, compare the embedded catalogue literal in all supplied legacy HTML files. If the latest Windows/Android versions contain the same catalogue data, use one canonical extracted catalogue and record proof. If they differ, stop destructive migration work, produce an exact diff, and preserve every version until the user decides which catalogue is authoritative.

### Behaviour authority

The latest Windows and Android v3.0.1 files are the behavioural reference for current features such as:

- invoice builder,
- editable invoice prices,
- invoice history,
- purchase list,
- Smart Packages,
- related-part suggestions,
- current search and vehicle-selection behaviour,
- light/dark theme behaviour,
- current mobile/desktop interaction details.

Do not regress these features while migrating away from the monolithic HTML.

### Scope overrides

The new PartAvar pack **does override** previous instructions that said:

- preserve the old visual design,
- keep the PartsFinder product name,
- avoid a public website,
- avoid expanding the operational feature set.

The new product name is **PartAvar** (`پارت‌آور` in Persian UI where appropriate).

The new scope includes:

- a professional redesigned PartAvar application,
- a distinct professional public PartAvar website,
- invoice/purchase/package workflows,
- historical price intelligence,
- improved vehicle discovery,
- import and operational tooling needed for those features.

The new pack **does not override** the previous data-integrity, migration, search-ranking, pricing correctness, offline atomicity, or rollback requirements.

---

## 3. Existing workspace first - never create a parallel toy project

Before editing:

1. inspect the repository tree,
2. inspect git status and current branch,
3. inspect package manager, lockfile, scripts, tests, current migration progress, database files, and docs,
4. identify which previous migration tasks are already implemented,
5. preserve unrelated user changes,
6. do not restart completed migration work,
7. do not create a second disconnected app beside an existing implementation.

Adapt this specification to the real workspace structure where equivalent modules already exist.

If the current workspace already implements Node/Fastify/SQLite/Vite/Dexie/Worker architecture, extend it. Do not replace it merely to match filenames in these prompts.

---

## 4. Required core architecture

Unless the real repository already contains a proven equivalent architecture, use:

- TypeScript
- Vite
- Node.js LTS
- Fastify
- SQLite with `better-sqlite3`
- Dexie / IndexedDB for the offline read-only catalogue replica
- a dedicated Web Worker for local search/index work
- Service Worker + web manifest for the installable web app shell
- Vitest
- Playwright

Do not add Redis, Elasticsearch, microservices, SSR, a heavy component framework, or a native Android rewrite unless a measured requirement appears and the user explicitly approves it.

The browser must never receive the full catalogue as an inline HTML/JS literal.

The main browser thread must never hydrate all catalogue records at startup.

---

## 5. Mandatory domain rules

These are non-negotiable:

- Preserve every source catalogue row and all source metadata.
- Technical code and logistics code are different identities.
- Do not merge sibling logistics entries' price, compatibility, friendly labels, aliases, or replacement values.
- Preserve raw strings and leading zeroes.
- Normalize only additional search/index fields.
- Preserve the original price value as an integer-safe value/string. Do not use lossy floating-point handling.
- Do not guess Rial/Toman when the source does not specify a unit.
- Middle price = base +10%.
- Final price = base +20%.
- Do not compound markups.
- Preserve `-01` as a ranking preference, not a filter or a semantic claim such as newest/best/genuine.
- Code-family grouping is display-only, never a data merge or fitment inference.
- Preserve all vehicle relationships and all raw vehicle labels.
- Preserve the existing Tiggo 7 Pro Max AWD naming projection exactly according to tested rules.
- Missing model membership means unknown/unassigned, not universal fitment.

For the original baseline, previous measured counts were 36,569 rows, 31,509 distinct technical codes, 36,569 logistics codes, and 119 raw vehicle models. If the active source differs, regenerate the baseline and report the exact difference instead of forcing old counts.

---

## 6. PartAvar product modules to implement

The production application must support these integrated modules:

1. **Catalogue Search**
   - vehicle + part-name search,
   - global technical/logistics code or part-name search,
   - all vehicle models reachable,
   - bounded results and lazy details,
   - exact copy actions,
   - related-part suggestions.

2. **Invoice Builder**
   - price mode selection,
   - editable unit price,
   - quantity,
   - totals,
   - history,
   - printable/PDF-ready invoice,
   - Excel export where supported.

3. **Purchase Lists**
   - technical code,
   - part name,
   - vehicle context,
   - save/reopen/export,
   - package-building entry point.

4. **Smart Packages**
   - rule-based related parts,
   - actual catalogue records only,
   - 2-5 focused suggestions,
   - vehicle-aware filtering,
   - code choice when multiple valid logistics entries exist,
   - editable package prices and totals,
   - transfer package lines to invoice without losing manually chosen prices.

5. **Price History Intelligence**
   - import historical company spreadsheets,
   - immutable source audit trail,
   - per-entry price observations,
   - trend metrics,
   - green/yellow/red price-momentum badge,
   - neutral insufficient-history state,
   - hover/click detail timeline,
   - sorting/filtering for purchasing and quotation work.

6. **Offline Catalogue**
   - verified install,
   - atomic updates,
   - rollback-safe activation,
   - Worker search,
   - honest readiness/error state.

7. **Settings / Operator Controls**
   - theme,
   - price-badge classification configuration,
   - default package price tier,
   - safe catalogue/update information,
   - no decorative controls without implementation.

Do not turn PartAvar into a generic CRM, marketplace, warehouse ERP, ecommerce checkout, or analytics dashboard unless the user later authorizes those modules.

---

## 7. Website and application are separate experiences

Build two coordinated but distinct surfaces:

### Public PartAvar website

Purpose: explain the product professionally, establish trust, and route authorized users into the app.

It may use more whitespace, brand storytelling, product screenshots, feature sections, documentation/support links, and strong calls to action.

### PartAvar application

Purpose: repeated, fast automotive-parts work.

It must be compact, data-dense, calm, precise, responsive, keyboard-friendly, touch-friendly, and operationally efficient.

Do not make the application look like a marketing landing page.

Do not make the website look like a cramped internal dashboard.

---

## 8. UI UX Designer plugin - real use required

The user explicitly requested the installed **UI UX Designer** plugin.

Discover and invoke the actual installed plugin skills. Do not invent commands or claim plugin use without evidence.

Use relevant capabilities where available, especially:

- `ux-audit-critique`
- `redesign-makeover`
- `dashboard-saas-ui`
- `mobile-app-ui`
- `website-ui-design`
- `design-system-builder`
- `component-design`
- `accessibility-audit`
- `design-handoff`

Use the plugin during:

1. initial UX audit,
2. app redesign proposal,
3. public website design proposal,
4. design-system definition,
5. final implemented-screen review.

The plugin does not replace browser tests, database verification, performance tests, or accessibility testing.

If a required plugin capability is unavailable in the current environment, state that clearly and continue only with the parts that can be executed honestly.

---

## 9. Implementation behavior

Do not stop after writing another plan.

Do not deliver empty schemas, mock APIs, placeholder buttons, static mockups, TODO-only offline code, or fake success reports.

Implement sequentially and verify each module.

Write regression tests before changing critical domain behavior.

Run actual commands.

Record actual outputs.

Do not claim:

- successful migration,
- performance improvement,
- offline readiness,
- PDF success,
- Android compatibility,
- accessibility compliance,
- deployment success,
- or test pass

without evidence from the corresponding environment.

---

## 10. Publishing and destructive actions

You may refactor and build inside the existing workspace.

Do **not**:

- deploy publicly,
- push to a remote repository,
- publish a release,
- destroy/overwrite the original source,
- delete existing databases/backups,
- or expose private catalogue snapshots

without explicit user authorization.

Provide a production deployment plan and configuration, but stop before irreversible/public actions unless authorized.

---

## 11. Required final handoff

Deliver at minimum:

- working PartAvar code integrated into the existing repository,
- migrated SQLite catalogue,
- historical-price schema/importer,
- offline snapshot pipeline,
- application UI,
- public website UI,
- invoice/purchase/package workflows,
- real tests and verification reports,
- migration reconciliation report,
- price-history import report format,
- design system documentation,
- before/after screenshots,
- responsive screenshots,
- performance measurements,
- backup/update/rollback/run instructions,
- known limitations and untested environments.

Use `10-FINAL-DELIVERY-CHECKLIST.md` as the final release gate.

Do not declare completion while any mandatory checklist item is unverified.

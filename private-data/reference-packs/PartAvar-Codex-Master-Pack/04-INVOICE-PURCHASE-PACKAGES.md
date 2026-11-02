# PartAvar - Invoice, Purchase List, and Smart Package Workflows

## 1. Preserve existing behavior first

The latest v3.0.1 source already contains working concepts for:

- invoice add actions,
- base/middle/final/custom price selection,
- editable unit price,
- quantity and line total,
- invoice grand total,
- invoice history,
- Excel/PDF/print actions,
- purchase lists,
- Smart Packages and saved packages.

Migrate these behaviors before redesigning them.

Do not remove a working workflow simply because the storage architecture changes.

---

## 2. Invoice line contract

An invoice line must snapshot:

- exact catalogue entry identity,
- raw part name,
- raw technical code,
- raw logistics code,
- selected vehicle context if present,
- base price at time of addition,
- price mode,
- custom markup percentage if used,
- editable unit price,
- quantity,
- line total.

Supported price modes:

- base,
- middle (+10%),
- final (+20%),
- custom percentage on base,
- manually edited price.

Once a user manually changes the unit price, preserve that explicit value.

Do not automatically change historical invoice prices when the catalogue updates.

---

## 3. Invoice draft UX

Required actions:

- add from a result card,
- choose price mode,
- set quantity,
- edit unit price inline,
- remove line,
- see immediate line total,
- see immediate grand total,
- clear draft with confirmation,
- save draft/history,
- reopen previous invoice,
- duplicate previous invoice,
- export/print.

Avoid unnecessary modal steps for routine edits.

Use a focused price-picker only at add time; subsequent unit-price edits should be direct.

---

## 4. Invoice header and template

The user plans to provide a final desired invoice sample later.

Therefore implement a flexible invoice-template data model rather than hardcoding an irreversible print layout.

Support configurable fields such as:

- PartAvar/company display name,
- document title,
- invoice/document number,
- date,
- optional customer name,
- optional customer phone/reference,
- optional notes,
- item table,
- total,
- optional footer.

Do not invent tax/legal fields or tax calculations that the user has not specified.

The current default template should be clean, professional, Persian RTL, and A4-print-safe.

Structure print markup so the final user-approved invoice can later replace the visual template without changing invoice storage.

---

## 5. PDF and print reliability

Use a dedicated print view/route/state with print CSS.

Do not depend on fragile popup windows in environments where popups/WebViews may block them.

For browser PDF export:

- print table must fit A4 width,
- repeat table headers when supported,
- avoid clipped codes/prices,
- keep RTL labels and LTR codes correct,
- hide interactive controls,
- use deterministic spacing,
- test Chrome desktop and mobile browser print behavior where available.

If a native APK/WebView wrapper later provides a print bridge, adapt through an abstraction instead of duplicating invoice logic.

---

## 6. Invoice history

History must survive clearing the current draft.

Each saved document should record:

- stable ID,
- created/updated time,
- total,
- item count,
- source catalogue version,
- complete line snapshots.

Actions:

- open,
- duplicate,
- export,
- delete with confirmation.

If backend storage is implemented, migrate from browser-only localStorage without silently losing legacy data.

---

## 7. Purchase list

A purchase-list line must preserve:

- technical code,
- logistics identity when known,
- part name,
- vehicle context,
- quantity if the new workflow supports quantities,
- source catalogue version.

When added after vehicle selection, preserve the selected vehicle context.

When added from global search, preserve the compatible-model summary or exact entry fitment reference rather than inventing one selected model.

Support save/reopen/export.

---

## 8. Smart Package pricing - new required capability

Package lines must gain invoice-like pricing.

Each line includes:

- quantity,
- price mode,
- base price snapshot,
- editable unit price,
- line total.

Package shows:

- total quantity,
- package total,
- per-line price labels.

The default package price tier must be a configurable operator preference.

If no preference exists, use a documented safe default but expose it in settings. Do not bury the behavior in UI code.

Changing a price inside one package must not change the central catalogue price.

---

## 9. Package -> invoice transfer

When moving a saved package to an invoice:

- preserve exact selected logistics entry,
- preserve quantity,
- preserve manually selected/edited unit price,
- preserve vehicle context,
- preserve part/code snapshot.

Do not re-price package lines silently using the latest catalogue value during transfer.

Offer an explicit optional action such as "refresh prices from current catalogue" only if implemented with a preview/diff and user confirmation.

---

## 10. Related-part rules engine

Move Smart Suggestions out of ad hoc DOM logic into a tested domain/configuration layer.

A rule should define:

- trigger terms/categories,
- related target terms/categories,
- priority,
- optional exclusions,
- max suggestions,
- vehicle filter behavior.

The engine must query actual catalogue entries.

It must never fabricate a code.

It must never auto-select between ambiguous logistics entries when fitment/prices differ.

---

## 11. Saved packages

Saved package includes:

- ID,
- name,
- created/updated time,
- vehicle context nullable,
- line snapshots,
- package total,
- source catalogue version.

Actions:

- open,
- rename,
- duplicate,
- update,
- add to invoice,
- export,
- delete.

Keep common sales packages quick to reopen without bloating the search screen.

# PartAvar - Product Scope and Functional Requirements

## 1. Product identity

**Product name:** PartAvar

**Persian display name:** پارت‌آور

PartAvar is a professional automotive-parts catalogue, quotation, purchasing, package-building, and price-intelligence platform for repeated operational use by Persian-speaking parts staff.

The current PartsFinder HTML application is the legacy source and behavior reference. The new product must retain its trusted search/data behavior while becoming a maintainable web platform.

Do not expose the old `PartsFinder` name as the primary product brand in the new customer-facing interface. Historical filenames and migration docs may keep the old name for traceability.

Do not fabricate a logo. If brand assets are not present, use a clean text wordmark until the user supplies/approves a logo.

---

## 2. Primary users and jobs

Primary users are automotive-parts sales, purchasing, technical, and internal operational staff who repeatedly need to:

- find the correct part quickly,
- verify the exact technical and logistics code,
- verify vehicle compatibility,
- compare base/middle/final prices,
- prepare a customer quotation/invoice,
- prepare a purchase list,
- build a multi-part package,
- identify related parts,
- inspect historical price movement before pricing or purchasing,
- continue catalogue lookup when temporarily offline.

Design every workflow around speed, accuracy, and low cognitive load.

---

## 3. Product surfaces

### 3.1 Public website

A separate professional marketing/product website for PartAvar.

The website should explain:

- what PartAvar does,
- catalogue search accuracy,
- offline capability,
- invoice/purchase/package workflows,
- price-history intelligence,
- product reliability/data-preservation principles,
- contact/support and application entry.

### 3.2 Operational web application

The app is the primary work surface.

Core navigation should expose, at minimum:

- Search
- Purchase Lists
- Packages
- Invoices
- Price Intelligence
- Settings / Data status

On mobile, use a compact navigation pattern suitable for repeated one-handed use. On desktop, use a compact sidebar or top navigation that does not waste horizontal space.

Do not add fake KPIs, sales charts, inventory levels, customer counts, or decorative dashboard widgets.

---

## 4. Functional module inventory

### 4.1 Search

Two preserved modes:

1. **Vehicle + Part Name**
   - select/search any supported vehicle model,
   - search by partial part name,
   - ranked results limited to the selected model context.

2. **Global Code / Part Name**
   - no vehicle required,
   - technical code,
   - logistics code,
   - replacement code where source semantics support it,
   - partial part name.

### 4.2 Result details

Each result must preserve:

- part name,
- raw technical code,
- raw logistics code,
- base price,
- middle price (+10%),
- final price (+20%),
- vehicle compatibility for the exact logistics entry,
- friendly labels,
- aliases,
- replacement value,
- code-family display relationships when applicable,
- price-history badge when history exists.

### 4.3 Invoice

Preserve and improve:

- add from result,
- price tier selection,
- custom markup option,
- manual editable unit price,
- quantity,
- line total,
- grand total,
- remove/edit,
- history save/reopen/delete,
- print/PDF-ready output,
- Excel output where supported.

### 4.4 Purchase list

Preserve:

- technical code,
- part name,
- vehicle context,
- save/reopen,
- remove/edit,
- export,
- package-building integration.

### 4.5 Smart Packages

Preserve Smart Suggestions but migrate them into a maintainable rules engine.

A package can contain:

- part,
- technical code,
- logistics entry identity,
- selected vehicle context,
- quantity,
- price mode,
- editable unit price,
- line total,
- package total.

Packages can be named, saved, reopened, edited, duplicated, exported, and transferred to an invoice.

### 4.6 Historical price intelligence

Import historical company spreadsheets and show price movement per catalogue entry without corrupting the current catalogue.

Detailed requirements are in `05-PRICE-HISTORY-INTELLIGENCE.md`.

### 4.7 Offline catalogue

The app shell and verified catalogue replica must work offline after successful installation.

Operational documents may have their own sync strategy, but catalogue correctness must never depend on multi-master browser writes.

---

## 5. Non-goals unless separately authorized

Do not add by assumption:

- customer CRM,
- public ecommerce checkout,
- online payment,
- stock/warehouse inventory quantities,
- accounting/tax automation,
- AI chatbot,
- marketplace sellers,
- supplier portal,
- automated purchasing,
- native Android rewrite,
- unrelated business analytics.

Design architecture extension points, but do not build speculative modules that slow down the core product.

---

## 6. Branding and visual product character

PartAvar should feel:

- precise,
- technical,
- dependable,
- modern,
- automotive,
- professional,
- calm rather than flashy.

The application and website should share tokens and brand recognition, but have different information density.

Avoid copying any competitor's protected visual identity.

Avoid generic "AI SaaS" styling, excessive glassmorphism, neon gradients, giant cards, fake car renders, and empty dashboard decoration.

---

## 7. Language and direction

Primary UI language: Persian RTL.

Technical/logistics codes and Latin vehicle designations remain exact raw values and must render in isolated LTR regions.

Mixed RTL/LTR text must never reorder or truncate codes.

Prepare UI architecture so i18n can be added later without hardcoding Persian strings inside domain logic, but do not add unrequested translations now.

---

## 8. Data truth vs UI convenience

Never simplify the UI by changing data meaning.

Examples:

- A logistics entry with a different price remains a separate entry.
- A logistics entry with different vehicle compatibility remains separate.
- A shared technical code does not permit price or fitment union.
- A missing model list is not universal compatibility.
- A price-history badge is a historical movement signal, not a guaranteed profit-margin signal.

When UX and domain correctness conflict, preserve correctness and improve the presentation instead of altering the data.

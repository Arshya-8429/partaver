# PartAvar - Application UI/UX Redesign Prompt

## 1. Use the installed UI UX Designer plugin

Discover the actual installed UI UX Designer plugin capabilities and use them honestly.

Relevant capabilities include, where available:

- `ux-audit-critique`
- `redesign-makeover`
- `dashboard-saas-ui`
- `mobile-app-ui`
- `design-system-builder`
- `component-design`
- `accessibility-audit`
- `design-handoff`

Do not invent plugin commands.

Use plugin output as design input, then implement real code and verify it.

---

## 2. Design direction

PartAvar application is a precision-focused automotive-parts work tool.

Desired character:

- compact,
- calm,
- technical,
- premium but not decorative,
- fast to scan,
- high information clarity,
- consistent light/dark themes.

Avoid:

- giant hero headers,
- glassmorphism everywhere,
- neon visual noise,
- oversized cards,
- marketing content inside work screens,
- fake charts/KPIs,
- decorative car photos in catalogue cards,
- horizontal-scroll-dependent layouts.

---

## 3. Application information architecture

Primary areas:

- Search
- Purchase Lists
- Packages
- Invoices
- Price Intelligence
- Settings / Catalogue status

Search is the primary work task and should remain one tap/click away.

Do not bury search behind a dashboard landing page.

Mobile may use bottom navigation or another compact native-feeling pattern.

Desktop may use a compact sidebar/top rail.

Navigation must not reduce useful result width unnecessarily.

---

## 4. Search screen

Preserve two clearly distinct modes:

- vehicle + part name,
- global code / part name.

Vehicle selector must search both preferred and other models.

Show recent/quick family controls compactly.

Part input should use PartAvar's custom suggestion overlay, not intrusive native datalist behavior.

Primary action should remain reachable with Android keyboard open.

---

## 5. Result cards

Result card hierarchy:

1. part name,
2. exact technical/logistics identity,
3. compact price group,
4. vehicle compatibility summary,
5. price-history badge,
6. actions.

Actions should include:

- copy technical code,
- copy logistics code,
- add to invoice,
- add to purchase list,
- related parts / package.

Use secondary actions in an overflow menu where needed on narrow screens, but do not hide the primary operational actions behind several taps.

---

## 6. Price display

Show together:

- base,
- middle +10%,
- final +20%.

Use explicit labels and typography.

Color is supportive, not the sole identifier.

Handle large values and unknown unit cleanly.

Do not label unit as Rial/Toman without trusted configuration.

---

## 7. Historical badge

Badge should be visually small but discoverable.

Required states:

- green high,
- yellow medium,
- red low/no increase,
- neutral gray insufficient history.

Hover/focus tooltip on desktop.

Tap/click detail sheet on both platforms.

Never require hover.

---

## 8. Detail surfaces

Mobile:

- full/near-full-height bottom sheet or page detail.

Desktop:

- side panel/dialog/detail route.

Lazy load variants and historical details.

Preserve search query, page, vehicle, and scroll position when closing details.

Back/Escape behavior must be predictable.

---

## 9. Invoice UI

Invoice workspace must support rapid editing.

Recommended desktop layout:

- main line table/list,
- compact totals summary,
- document metadata panel,
- export/print actions.

Recommended mobile layout:

- stacked editable lines,
- sticky total/action region that does not cover content,
- no wide table requiring horizontal scroll.

Unit price and quantity should be directly editable.

Show whether a line uses base/middle/final/custom/manual price.

---

## 10. Package builder UI

Package builder should feel like a focused sales/purchasing workflow, not an ecommerce cart.

Each line:

- part,
- code,
- vehicle,
- quantity,
- price mode,
- editable unit price,
- line total.

Show package total and save name.

Smart Suggestions appear near the package context with 2-5 items, each with explicit code/entry selection when necessary.

---

## 11. Responsive requirements

Test at:

- 320
- 360
- 390
- 430
- 768
- 1024
- 1440 CSS px

No unintended page-level horizontal scrolling.

Do not fix overflow by globally hiding it.

Technical codes must wrap safely or be copy-scrollable within a constrained code component without breaking the whole page.

Inputs should use at least 16px text on mobile to avoid browser zoom surprises.

Touch targets approximately 44x44 CSS px minimum.

---

## 12. RTL / typography

Persian RTL globally.

Use isolated LTR for:

- technical codes,
- logistics codes,
- Latin vehicle names,
- numeric groups when needed.

Use a licensed/system-safe Persian-capable font stack.

Do not bundle proprietary fonts.

Use a monospace stack for code.

---

## 13. Design system

Create semantic tokens for:

- canvas,
- surface,
- elevated surface,
- border,
- text primary/secondary/muted,
- accent,
- positive/warning/error,
- price-history green/yellow/red/neutral,
- focus ring,
- spacing,
- radius,
- shadow/elevation,
- typography,
- motion.

Use an 8px-oriented spacing system with 4px substeps where needed.

Both light and dark themes must cover every component and state.

No accidental white cards in dark mode.

---

## 14. Motion

Restrained motion only:

- 120-200 ms transform/opacity transitions,
- subtle press feedback,
- skeleton/progress states where real loading exists,
- respect `prefers-reduced-motion`.

Avoid expensive height animations on large result collections.

---

## 15. Accessibility

Target WCAG AA-level design behavior without making unverified compliance claims.

Test:

- contrast,
- focus visibility,
- keyboard flow,
- screen-reader labels,
- combobox semantics,
- dialogs/sheets,
- toasts/status announcements,
- zoom/text enlargement,
- touch targets.

Do not use color alone for price-history meaning.

---

## 16. Required UI/UX deliverables

Create:

- `docs/uiux/app-audit.md`
- `docs/uiux/app-redesign-spec.md`
- `docs/uiux/design-system.md`
- `docs/uiux/component-states.md`
- `docs/uiux/accessibility-review.md`
- `docs/uiux/final-design-review.md`

Capture real implemented screenshots:

- mobile light/dark,
- desktop light/dark,
- search results,
- invoice,
- package builder,
- historical badge/details,
- offline/update state.

Do not deliver mock screenshots as implementation evidence.

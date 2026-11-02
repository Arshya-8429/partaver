# PartsFinder design system

Status: implemented in `apps/web/src/styles/app.css` on 2026-10-27. This file documents the shared tokens and components; real rendered evidence is in `verification-report.md`.

## Foundations

Use a precision-focused neutral palette and one blue accent. Meaning comes from labels and structure as well as color. All customer-facing copy is natural Persian; raw vehicle names/codes retain their original strings.

| Semantic token | Light | Dark |
|---|---|---|
| canvas | `#F5F7FA` | `#0C1422` |
| surface | `#FFFFFF` | `#131F30` |
| surface-elevated | `#FFFFFF` | `#1A2940` |
| text-primary | `#152238` | `#ECF2FA` |
| text-secondary | `#45556C` | `#B5C3D7` |
| text-muted | `#5D6B80` | `#9BAEC6` |
| border-subtle | `#D7DFE8` | `#2D4059` |
| border-control | `#8596AB` | `#637A97` |
| accent | `#1D4ED8` | `#84ACFF` |
| accent-hover | `#1E40AF` | `#A2C0FF` |
| accent-soft / selection | `#EAF1FF` | `#1D3354` |
| on-accent | `#FFFFFF` | `#0C1422` |
| focus-ring | `#2563EB` | `#A2C0FF` |
| positive text / surface | `#0B684E` / `#E7F6EE` | `#79D9B2` / `#153C32` |
| warning text / surface | `#8A4B08` / `#FFF4DE` | `#F3CA78` / `#3B301D` |
| error text / surface | `#A42B34` / `#FDECEF` | `#FFB3B8` / `#472832` |

Calculated solid-color contrast examples: light primary text on surface 15.94:1, secondary 7.58:1, muted 5.41:1, accent 6.70:1, control border 3.02:1. Dark primary text on surface 14.73:1, muted 7.32:1, accent 7.36:1, primary-button label on accent 8.19:1, control border 3.76:1. The implementation uses these token pairs in both themes. Calculated pairs are in `reports/uiux/after/palette-contrast.json`; browser coverage and untested assistive technology are recorded separately.

Typography: local system sans-serif with suitable Persian fallbacks; no font download or proprietary font asset. Use 14–16px body, 18–20px screen heading, 15–16px entry title, 12–13px metadata, and 16px inputs. Persian line height approximately 1.7. Codes use `ui-monospace, SFMono-Regular, Consolas, monospace`, 14–16px, `direction:ltr`, `unicode-bidi:isolate`, and safe wrapping. Prices use tabular numbers and BigInt-safe formatting.

Spacing scale: 4, 8, 12, 16, 24, 32px. Mobile gutters 12–16px; desktop 24px. Radius: 8px compact controls, 10px fields, 12px entry surfaces, 16px dialog. Use a restrained border and one subtle elevation level for suggestions/dialogs; avoid per-price blur/glass and multiple layered shadows.

Motion: approximately 140–180ms opacity/transform feedback; no height animation on result collections, perpetual effects, or forced-layout card loops. Reduced-motion disables nonessential transitions and smooth scrolling.

## Components

| Component | Anatomy and states |
|---|---|
| App header | Product identity, catalogue status/info, 44px theme button; compact in both themes. Real metadata in information view. |
| Search modes | Two labelled tabs with active/focus/disabled states, roving keyboard focus, associated tab panels, and reliable hidden semantics. |
| Vehicle combobox | Visible label, 16px input, separate committed selection and active option, clear action, scrollable suggestion list, grouped source options, active-descendant announcement. Loading/no match/failure remain distinct. |
| Preset disclosure | Wrapping family controls with 44px targets; expandable trim area; every source family/variant reachable. Selected styling never changes memberships. |
| Search action | 48px primary action, immediate Enter; no debounce on submission. Clear/reset is secondary. Invalid input links to the relevant field. |
| Results header | Matching entry total, optional family total, displayed range, page number, and loading/empty/error announcements with distinct wording. |
| Entry row | Entry name, isolated full technical/logistics codes, visible copy actions, three labelled prices, one unit note, entry-scoped fitment summary, details and computed-family actions. |
| Price group | Three columns only when full digits fit; otherwise three compact label/value rows. Final price uses modest weight/surface emphasis. No ellipsis or guessed currency. |
| Copy action/toast | Icon plus accessible action name; 44px target; pending/succeeded/failed states. Selectable code fallback. Toast announces briefly without moving focus or covering controls. |
| Detail dialog | Explicit title/logistics identity, close control, loading/error/retry, real entry relationships; focus capture/restoration, Escape, back navigation, safe area, retained background scroll state. |
| Family detail | Neutral computed/unverified header with accurate entry/variant counts; 10 unique matching variants per page; each expanded variant shows 10 entry summaries per page. Each entry owns its prices/fitment. |
| Catalogue status | Connectivity and offline readiness separately labelled; expandable install/update details; truthful stage/progress; old-version availability, retry/resume, cancel and storage failure. |
| Theme switch | Saved/system initial preference, text alternative for the action, no spinning emoji; both themes apply to native form controls, toasts, dialogs, skeletons, and errors. |

## Interaction rules

- Focus ring is visible on every interactive element, with an offset that is not clipped by its container.
- State styling includes hover, focus-visible, pressed, selected, disabled, loading, invalid, empty, success, and error in both themes. Essential actions never depend on hover.
- Preserve full raw values when copying, including leading zeroes and meaningful suffixes.
- Do not announce every chunk or every result-card insertion. Use one polite search/status region and a separate concise copy feedback region.
- A missing vehicle assignment means missing information. A code family is an unverified display grouping. A replacement is a source reference. These meanings stay visible in the relevant detail context.
- Use inline SVGs from one small consistent visual set. Decorative icons are hidden from assistive technology; icon-only controls have accessible names.

## Maintenance

Use semantic CSS custom properties and logical layout properties. Components consume tokens rather than scattering hex colors or theme overrides. Document any new token or component state here with its purpose, both-theme values, and test evidence. Verify complete strings, large prices, mixed scripts, 200% text, and the full viewport matrix after each relevant layout change.

## Implementation notes

Use the single `app.css` stylesheet imported by `main.ts`. `body.dark` overrides the same semantic properties and sets native color-scheme. SVG paths in `icons.ts` are static authored markup; catalogue text is rendered with textContent. `entry.ts` formats decimal strings with BigInt and observes only rendered price groups to stack complete numbers when needed. `details.ts` owns one native dialog and one history entry, preserving the main list underneath. `catalogue.ts` routes reads without embedding records.

Small secondary brand/badge text uses 11px in constrained mobile layouts; controls, raw codes, prices and ordinary metadata retain readable sizing. This is a design choice, not a claim that every possible text-size/browser combination was audited.

## PartAvar operations addendum

Status: implemented across `apps/web/src/documents/`, `apps/web/src/price-intelligence/`, `apps/web/src/ui/related.ts`, and `apps/web/src/ui/catalogue-status.ts`.

| Surface | Interaction and information rules |
|---|---|
| Related parts | Keep the source entry, selected vehicle context, and target document visible. Related alternatives preserve their own logistics identity, price and fitment; show one bounded page at a time and ask the operator to choose whenever multiple candidates exist. |
| Purchase list, package and invoice | A line is pinned to the exact catalogue version and entry ID. Technical and logistics codes are separately labelled. Manual unit prices and quantity are editable; a saved document can be reopened, copied, deleted, printed or exported. Transfers preserve the entered price and quantity. |
| Price history | Classification always includes a text label; neutral or insufficient history is not styled as a warning. A badge opens the entry-specific timeline with source name, sheet, row, date, currency, price and current catalogue base price. Timeline pages are bounded and stale cursors offer a retry from the first page. |
| Catalogue update | Connectivity, local readiness and update availability are distinct. Progress comes from the installer; cancellation or a failed update retains the old ready catalogue. A stale cross-tab lease tells the operator when a retry is safe. Quota errors are actionable and do not claim that a partial catalogue is ready. |
| Print and spreadsheet | The print view uses a dedicated A4 sheet with an explicit document title and identity columns. Excel output is a real `.xlsx`; long identifiers and prices remain text-safe and untruncated. Neither output embeds unrelated product imagery. |

New components continue to consume the same light/dark semantic tokens. These flows have real browser evidence in `reports/partavar/final-e2e.log`, `reports/partavar/history-ui-e2e.png`, and `reports/partavar/integrated-invoice-print.png`; verification limits are recorded in `docs/uiux/partavar-final-verification.md`.

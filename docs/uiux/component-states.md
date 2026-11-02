# Implemented component states

Final source review 2026-10-28; relevant final browser checks passed. Release ZIP verification is tracked separately in the release audit. This is the state inventory for the existing PartAvar implementation, not a new feature proposal. Shared tokens, type and spacing remain in [design-system.md](design-system.md). Actual verification and remaining limits are in [accessibility-review.md](accessibility-review.md) and [final-design-review.md](final-design-review.md).

| Component | States / transition | Implementation contract |
| --- | --- | --- |
| Application navigation | Search, purchase, packages, invoices, price intelligence, settings | Native buttons with `aria-current=page`; hidden work areas leave the visible flow. Search state is retained on routine area navigation. |
| Search modes | Vehicle/name, global code/name; selected, focus, disabled | Real tab/tab-panel association, roving tab order and Arrow/Home/End support. Enter/search submits immediately. |
| Vehicle picker | Empty, searching, options, active option, committed trim, no match, failure, clear | Named combobox/listbox; Arrow/Enter/Escape; preferred/family/other/raw models reachable. Focused option does not imply selected trim. |
| Part suggestions | Idle, delayed query, loading, options, active, dismissed, stale | Custom listbox, no native datalist; sequence/abort/version/vehicle guards. Mobile input hints suppress browser correction/autocomplete where supported. |
| Search results | Welcome, loading, success, zero matches, invalid input, failure/retry | Distinct messages. At most 20 top-level cards per page; pagination replaces visible cards. Old request cannot repopulate clear/mode change. |
| Technical/logistics codes | Full/selectable, copied, copy failed | Separate labels, isolated LTR and exact raw copy. Failure does not produce success feedback. |
| Price group | Three columns, stacked narrow/large-text layout, unknown currency | Whole integer strings and explicit base/+10%/+20% labels. Both markups derive from base; no digit ellipsis. Width-triggered ResizeObserver writes are scheduled with RAF to prevent feedback loops. |
| Entry details | Closed, loading, ready, error/retry | One native dialog, named heading, Escape/Back and trigger focus restoration. Relationships belong to exact entry/version. |
| Code family | Closed, loading, matching variants, all-entries disclosure, page change, error | Display-only/unverified label; bounded variant and entry pages; no merged price or fitment. |
| Related parts | Loading, reliable choices, ambiguous logistics choices, no reliable suggestion, adding, error/retry | Rule-based actual catalogue entries, selected-vehicle filter, explicit choice where required; at most five focused target groups. |
| Invoice/package/purchase line | Added snapshot, tier/custom/manual price, quantity edit, remove confirmation | Entry ID qualified by version; decimal integer values; manual price preserved across save/open/transfer. |
| Document lifecycle | Draft, saved, edit saved, duplicate, new/clear, delete, export | Persistence in `PartAvarOperations`; clear does not delete history. JSON import adds reviewed documents with new IDs. |
| Document import | File choice, parsed preview, warnings, optional preference replacement, confirmed import, rejected file | Bounded JSON, explicit preview/confirmation, additive records, unresolved legacy identity visible. |
| Print view | Mounted, print media, browser print request, return | Same-page view, A4, repeated headers, controls hidden in print, LTR codes and configurable template. |
| Price history badge | High/green, medium/yellow, low/red, insufficient/neutral, cached stale | Text/accessibility label plus color. Bound to entry and catalogue version; full timeline loaded on demand. |
| Price history detail | Loading, evidence, paginated timeline, no evidence, cached stale, failure/restart | Source file/SHA/sheet/row/date/unit; current catalogue price distinguished from historical observations. No date/margin invention. |
| Price list filters | Default, applied status/minimum/date/sort, page change, stale cursor, retry | Optional workflow; date fields filter latest observation date, not arbitrary-window recomputation. Server filter settings are distinguished from local badge preferences. |
| Connectivity | Connected, disconnected | Separate from readiness; connection icon alone never proves offline installation. |
| Catalogue install | Empty, downloading, importing, indexing, validating, ready, failed | Real progress and stages. Cancel/resume, corruption/quota/lease errors; previous version retained. Shell readiness checked separately. |
| Cross-tab activation | Version announcement, local status refresh, query invalidation | Broadcast/focus/visibility refresh shared IndexedDB status, preserve query text and invalidate stale rows; all three-engine regressions pass. |
| Theme | System default, persisted light/dark, action feedback | Semantic token overrides include forms/dialogs/toasts/errors. No essential remote font or icon dependency. |
| Motion | Standard, reduced | Restrained opacity/transform transitions; reduced-motion disables nonessential animation. |
| Public navigation | Desktop, collapsed mobile, expanded, Escape, active route | Native anchors with route-specific metadata; touch/keyboard targets. Public pages make no catalogue API requests. |
| Public preview | Loading, real empty app screenshot, unavailable fallback | No catalogue rows/codes/prices in public image; useful app/help actions remain on image failure. |
| Unknown public route | Missing page, home/support actions | Explicit not-found content and noindex; production HTTP status checked separately. |

Before shipping a changed component, verify the affected states in both themes and with full raw codes, large prices and Persian/Latin mixed text. Do not use global horizontal clipping as a layout correction. New behavior needs corresponding browser evidence rather than a checkmark based only on this inventory.

Final evidence: [27 unique latest-pass scenarios](../../reports/release-2026-10-28/browser/combined-case-matrix.json), combined across initial/focused runs (not a single 27-case green run); [final 25-case Chromium suite](../../reports/release-2026-10-28/final-e2e.log); [browser report](../../reports/release-2026-10-28/browser/browser-release-report.md) with 108 automated state audits and explicit physical-device/Safari/screen-reader limits. Earlier red/harness outputs are retained.

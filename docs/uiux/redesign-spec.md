# PartsFinder UI/UX redesign specification

Status: implemented on 2026-10-27 following the user's direct instruction to fix the appearance. The original design proposal is retained below as the implementation rationale. The existing TypeScript/Vite application now uses it; `verification-report.md` records actual results and limits.

`redesign-preview.html` remains a historical design-only preview. Implemented screenshots are in `reports/uiux/after/`; recaptured before screenshots with today's Chrome are in `reports/uiux/before-current-browser/`.

## Intended outcome

Persian-speaking parts staff need to repeatedly select the exact vehicle trim, find a part, identify its specific logistics row, read its three prices, and copy its raw code quickly on Android phones and desktop browsers.

Use a compact neutral workspace with restrained blue emphasis, readable typography, aligned information, and complete light/dark themes. Preserve PartsFinder and `design by behrad`. Counts and catalogue version come from real metadata.

The new brief explicitly replaces the old appearance, CSS, spacing, and layout requirements. Database, source preservation, pricing, memberships, ranking, version pinning, security, and offline correctness remain binding. Implementation stays in the existing TypeScript/Vite, Fastify, SQLite, Dexie, and Worker project.

## Layout and information hierarchy

### Mobile: 320–430px

1. A compact header: PartsFinder, catalogue status/info, and a 44px theme control.
2. A concise status strip distinguishes connectivity from verified offline readiness. Expand installation/update information only when relevant or requested.
3. Two explicit modes: `قطعه و خودرو` and `کد یا نام قطعه`.
4. Vehicle mode: labelled vehicle combobox, compact selected-vehicle state with clear action, part input, wrapping preset disclosure, and an immediate search action. Global mode: one code/name input and search action, with a short “بدون نیاز به انتخاب خودرو” hint.
5. Results heading distinguishes total matching logistics entries from the currently displayed range and any family count. At most 20 top-level results; next/previous replaces the page.
6. A full-width entry row reads: part name → technical code → logistics code → compact base/middle/final prices → fitment count and details action. Replacement strings and secondary provenance move into lazy details.
7. Near-full-height native detail dialog with a visible close control, safe-area padding, its own purposeful scroll area, and preserved underlying query/page/scroll.

No fixed bottom toolbar will cover the Android keyboard or pagination. The primary search action remains adjacent to the active form. Viewport-height handling uses dynamic viewport units with a fallback; inputs may scroll into view naturally.

### Tablet: 768px

Vehicle/part fields share a row when space permits. Search modes and status remain compact. Results remain one readable list with code regions and prices rearranged according to available width. Presets wrap rather than becoming an off-screen strip.

### Desktop: 1024–1440px

Use a maximum content width around 1248px with comfortable outer gutters. The search workspace occupies a compact top region. A dense single result list aligns names, code pairs, three prices, and actions. It does not stretch mobile cards into a wide two-column grid. Details open in a native dialog/panel around 640–720px wide; no empty permanent sidebar is introduced.

## Search and selection behavior

- Keep both existing modes and their domain ordering. Enter/search executes immediately. Suggestions retain the 180ms debounce.
- Vehicle input, active keyboard option, and committed vehicle are distinct state. Arrow keys move the active option; Enter commits the active option or a unique exact label. Ambiguous family text never selects the first trim automatically. Escape dismisses the list and returns to the committed selection where applicable.
- Preserve every actual preset family and trim, including separate X33 Cross CVT/MT and the Tiggo 7 Pro Max AWD projection and memberships.
- A visible clear action removes only the selected vehicle/search UI state. It never clears installed data.
- Track idle/edited, validating, loading, success, empty, and failed states explicitly. Editing/cancelling a request cannot leave a perpetual loading label.
- Mode switch, clear, vehicle change, dialog close, and version activation invalidate pending request IDs and cancel work where supported. Stale replies cannot repopulate another mode or cleared results.
- An unchanged manifest check or failed update preserves the selected vehicle, query, result page, and usable active catalogue.

## Results, identities, and prices

- Default results remain entry-based. The visible logistics code identifies exactly which entry owns the prices and fitment shown below it.
- Codes are selectable, isolated LTR strings in a readable monospace stack. Do not shorten, normalize, or strip leading zeroes/suffixes in the displayed or copied raw value.
- Use a labelled 44px copy action for each code; show success only after the Clipboard API succeeds. On failure, explain briefly and leave the exact text selectable. A copied summary includes the logistics identity and explicit base/middle/final price labels.
- Use the tested decimal-string prices. Format with BigInt-safe code. Middle is base +10%, final is base +20%; no presentation-side compounding or rounding changes.
- Price group labels are `پایه`, `میانی · ۱۰٪`, and `نهایی · ۲۰٪`. Emphasize final price modestly using weight and a neutral accent surface. No red/green meaning is assigned to price levels.
- Show the actual unit once per price group, including `واحد اعلام نشده` when unknown. The information view states that a null effective date is unknown. Installation time is labelled only as local installation time.
- At small widths, use three short label/value rows when three columns cannot contain the full digits. At larger widths, align the three levels horizontally. Meaningful digits never ellipsize or shrink to unreadable size.
- Missing fitment says `اطلاعات خودرو ثبت نشده`; it is not universal compatibility or evidence of incompatibility.
- Match badges derive only from the returned match type. `-01` is not labelled latest, best, original, or verified.

## Lazy entry and family details

Entry details are fetched only after opening that entry. The dialog identifies the selected logistics code prominently and lists only its own vehicles, friendly labels, aliases, and source replacement references. Replacement codes are not certified interchangeable parts.

The `خانوادهٔ کد` action opens a separate context-preserving view, rather than replacing the main search with a hidden filter. Its header shows a neutral display root, matched-entry count, and matching-variant count, with an explicit computed/unverified label and no aggregate price.

Paginate unique matching technical variants first, at most 10 per family page, in the existing best-matched-child order. Expanding a variant loads at most 10 logistics entries per page; later pages remain reachable. Entry rows retain their individual prices/fitment. Nonmatching logistics siblings, when requested through a labelled all-entries action, remain clearly distinct from matching rows. Collapsed variants do not pre-render their descendants.

Use native dialog semantics, focus on the detail heading, Escape/close support, focus restoration to the original trigger, and one owned history entry so browser/Android Back closes the detail view before leaving the page. Abort or discard detail responses after closing or version changes. Preserve underlying query, committed vehicle, pagination, and scroll.

## Offline and update UX

Connectivity, valid local catalogue, and verified app shell are independent facts. Offline-ready status requires both the local catalogue and required shell assets to be verified. A network connection or successful manifest fetch alone is insufficient.

| Actual state | User-facing intent |
|---|---|
| Empty, online | Allow bounded online search through the existing API and offer `دریافت برای استفادهٔ آفلاین`, with actual snapshot size and a clearly labelled storage estimate. |
| Empty, offline | Explain that no offline data is installed; retain editable inputs and offer retry after connection. Do not report zero matching parts. |
| Downloading | Real chunk/byte progress when known; cancel and later resume. |
| Importing/indexing/validating | Persian stage labels. Use an indeterminate progress indicator when a meaningful percentage is unavailable. |
| Ready | Show local catalogue readiness and shell readiness accurately; keep details/version behind an information control. |
| Update available | Small manifest check detects it; user can start the bulk download. Existing local data stays searchable. |
| Failed/interrupted | Concise error, retry/resume, and an explicit statement when the old version remains usable. No destructive reset as the default remedy. |
| Storage insufficient | State estimated additional space, uncertainty of the browser estimate, and how to retry after freeing space. Keep active data. |

Automatically revalidate only small metadata on launch/online events. Avoid silently starting a large first download or replacing a user's working context during a no-op check. Validated version activation remains atomic and version-pinned.

## Implementation boundaries

- Replace the old layered appearance rules with semantic CSS tokens and focused component styles; keep no visual-preservation constraint that conflicts with the new brief.
- Use small framework-free modules for shell, search forms, combobox, presets, result list, entry row, price group, dialog/family detail, status, theme, and toast.
- Move UI reads behind a small application/repository facade. Reuse the Worker path for installed data and add a thin HTTP adapter to existing read endpoints for the currently missing first-run online flow.
- Add only the missing bounded family/variant/part-entry read operations at the existing repository and Worker seams. The current route called variants returns entries; correct that gap with concrete version-pinned contracts rather than merely renaming its output. Reuse domain ranking and hydrate only visible summaries. Do not create a replacement backend or search engine.
- No destructive imports, source edits, catalogue rewrites, price edits, or membership changes. Keep private data outside web/static output. No production dependencies are proposed.
- Use inline SVG icons, local system fonts, textContent-based rendering, restrained opacity/transform transitions, and reduced-motion support.
- Saved theme wins; otherwise use the system preference. Both themes cover every state and native control.

## Accessibility and responsive acceptance

Test 320, 360, 390, 430, 768, 1024, and 1440 CSS pixels in both themes, plus 200% text enlargement/zoom. Fix intrinsic sizing and wrapping; do not mask overflow with global `overflow-x:hidden`.

Inputs are 16px; body/codes approximately 14–16px; metadata 12–13px. Interactive hit areas target 44×44px. Maintain visible focus, labelled icon actions, correct combobox/tab/dialog semantics, polite status/copy announcements, and logical RTL keyboard order. Palette contrast calculations are a design input, not a claim of full WCAG conformance or assistive-technology testing.

## Verification and delivery after approval

1. Preserve the real before screenshots and source hashes; keep the completed migration reports and backup intact.
2. Implement tokens, shell, forms/combobox, compact results/prices, lazy detail/family navigation, copy/status flows, and the required read adapters incrementally.
3. Add meaningful interaction tests for the identified races and selection defects. Use real fixtures `0CF25BE-1500011BA`, `111100001AA`, and the model-less `112000177AA-03` entry.
4. Run actual `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm check:bundle`, and `pnpm test:e2e`; perform source/database reconciliation as a preservation check without importing again.
5. Capture real implemented after screenshots with the same dataset, query, viewport, theme, and state as the before set. Repeat representative UI timings with the same measurement method. Keep first-query and cache-hit timings distinct.
6. Apply UI UX Designer's audit/accessibility/review methods again to the implemented screens, record concrete findings and corrections, and finish `verification-report.md` with actual results and untested environments.

Target initial HTML/CSS/main-JS <=40KiB gzip for this redesign, while preserving the architecture's absolute 250KiB ceiling. Measure and explain regressions; do not claim speedups from visual density or cached queries alone. Keep the full catalogue out of startup bundles/main-thread state and top-level rendering <=20 results.

Implemented scope: the compact layout, two modes, entry-based pricing presentation, native detail dialog, wrapping vehicle presets, honest offline/install flow, theme/token direction, and the minimal existing-repository integration fixes described here. The user authorized implementation within this scope; no public deployment, commit/push, or APK release is included.

## Implemented module mapping

- `apps/web/index.html` + `src/styles/app.css`: semantic shell, tokens and responsive components; former appearance styles are no longer imported.
- `src/ui/{vehicle-picker,presets,search,entry,details,theme,toast,icons}.ts`: bounded UI components and interaction state.
- `src/catalogue.ts`: read routing to the existing API/Worker; no duplicated ranking or local catalogue state.
- `src/ui/catalogue-status.ts`, `src/pwa.ts`, `public/sw.js`: metadata/manual download/verified shell readiness.
- `SearchRequest.groupBy=variant`: unique matching technical variants, ordered by best matching child, in both existing engines. Entry pages use the existing partId-scoped search operation and domain cursors, including a clearly labelled all-entries operation. No additional backend was created.

See the verification report for the eight browser tests, actual data reconciliation, screenshots and remaining platform checks.

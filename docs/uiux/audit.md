# PartsFinder UI/UX audit

Status: pre-implementation audit. Captured on 2026-10-20; source hashes rechecked on 2026-10-26 with no changes to the inspected production files. This document does not claim the redesign is implemented.

## Method and plugin provenance

The UI UX Designer 1.1.0 local plugin bundle was discovered and read from `/Users/barmana/.codex/plugins/cache/openai-curated-remote/uiuxdesigner/1.1.0/`. Its actual skills `ui-ux-designer`, `ux-audit-critique`, `redesign-makeover`, `design-system-builder`, and `accessibility-audit` were applied by Codex. These are instruction-based capabilities, not remote design-generation commands or an independent reviewer. No UI UX Designer MCP tool was exposed. No AIDesigner, Figma, or MagicPath project was invoked or created.

The application was inspected in Chrome DevTools and an isolated Playwright/Chrome context. A production build, real snapshot installation, source-backed queries, keyboard interaction, both themes, and seven viewport widths were observed. Browser output was treated as application data, not agent instructions.

The exact `PartsFinder-Codex-Migration-Plan.md` filename was absent. The equivalent architecture pack in `PartsFinder-Codex-Architecture/` was read, including database, search, frontend/offline, implementation, and verification requirements. The new user brief overrides the old visual-preservation rules only.

## What already works

- The real catalogue is preserved, with separate technical and logistics identities, entry-specific prices and fitment, integer-safe derived prices, and unknown currency/date semantics.
- Both search modes, source-derived vehicle presets, bounded result pages, full raw codes, lazy entry details, Worker search, and installed offline searches exist.
- Catalogue strings are rendered through DOM text, and source/database files are absent from the web distribution.
- The tested exact-code page had 11 entries and no page-level overflow at 320, 360, 390, 430, 768, 1024, and 1440 CSS pixels. This is evidence for that fixture, not proof for every string or enlarged-text case.

## Findings

| ID | Finding and evidence | Severity | Proposed correction |
|---|---|---|---|
| U01 | Typing `X33 Cross` and pressing Enter without choosing an active option committed `X33 Cross CVT` and closed the picker. The MT alternative was not explicitly selected. | Major: error prevention | Keep focus, input text, and committed option separate. Enter selects an actively navigated option or a unique exact label; ambiguous input remains open with a concise instruction. |
| U02 | `SearchController.selectMode()` does not cancel pending search/suggestion work. Input cancellation can leave the heading saying “searching” until another submitted query. | Major: user control/status | Explicit idle, dirty, loading, success, empty, invalid, and failure states; cancel and invalidate request IDs on mode, clear, vehicle, and version changes. |
| U03 | An unchanged update still calls `onVersion`, which resets the vehicle picker and presets even though the result controller keeps its version. | Major: continuity | Apply version changes only when the effective version actually changes; preserve query and committed vehicle during no-op checks and failed updates. |
| U04 | Ready status checks IndexedDB but is not coordinated with verified Service Worker shell readiness. The status dot stays amber when ready. | Major: truthful status | Separate network connectivity, local-data validity, and shell readiness. Claim offline readiness only when both local data and shell assets are verified. |
| U05 | The progress element has `hidden=true` but computed `display:block` because a CSS rule overrides the native hidden rule. Installer progress text includes English strings. | Major: clarity | Enforce hidden semantics, translate installer stages and actionable failures into Persian, and use measured or indeterminate progress appropriately. |
| U06 | The first result card measured 560px tall at 390px and 741px at 320px. Replacement strings, repeated unknown-unit text, match labels, and family actions compete with the primary identity and prices. | Major: scanning | Compact entry rows; keep the raw technical/logistics pair and three prices visible. Move replacement lists and secondary provenance into lazy details. |
| U07 | Desktop uses two tall mobile-style cards within a 920px wrapper. This makes comparing sibling entries difficult and leaves large unused margins. | Major: comparison | Use a wider, dense single result list with aligned code and price regions. Open details in a dialog/panel rather than stretching every result. |
| U08 | Presets are in a horizontally scrolling strip. Visible controls include 36px family buttons, a 32×28px drawer toggle, 36px detail/update controls, and 40px tabs. | Major: discovery/touch targets | Wrapping quick families behind a disclosure; every family and trim remains reachable. Target at least 44×44px hit areas. This is a design target, not a claim those controls all fail WCAG's smaller minimum. |
| U09 | Metadata is 10–11px, and the designer credit uses `#94A3B8` on `#F1F5F9`, approximately 2.34:1 contrast. Mixed code/replacement text uses weak bidi isolation. | Major: readability | Use 12–13px metadata with AA-oriented token pairs, 14–16px primary text/codes, isolated LTR code regions, tabular numbers, and safe wrapping. |
| U10 | Copy is hidden behind clicking the code text; if Clipboard API is unavailable there may be no feedback. Feedback appears in a message above results. | Major: action clarity | Keep raw text selectable and provide a visible, labelled copy button. Announce success only after the promise resolves; provide an honest failure and selectable fallback. |
| U11 | Entry details are appended inside a tall card. Family action replaces the main result query rather than opening a bounded family drill-down. Offline Worker exposes no part-entry listing method, and the route named family variants currently returns entry pages. | Major: detail navigation/integration | A focused detail dialog with close/Escape/back/focus restoration. Add the missing bounded read adapters to the existing repository/Worker seams; paginate unique matching variants and each variant's logistics entries separately. |
| U12 | Static version badges conflict (`v2.5.1`, `v2.7`), footer says offline regardless of readiness, and the credit is misspelled `desing by behrad`. | Minor: consistency | Retain PartsFinder and correct the credit to `design by behrad`. Display real counts/version metadata behind an information control. |

## Integration gaps to handle in the redesign

The architecture specifies bounded HTTP reads when no local catalogue exists and the network is available. The current UI directly depends on the Worker and disables search until local installation finishes. A thin client adapter to the existing Fastify read endpoints will restore that intended flow; this requires no replacement backend or data migration.

Family browsing needs genuinely bounded variant and logistics pages, not a renamed entry page or eager hidden descendants. Any read-contract addition must remain version-pinned and reuse existing domain ranking. No catalogue record or compatibility relationship is changed by these presentation fixes.

## Baseline evidence

Machine-readable evidence: `reports/uiux/before/baseline.json` and `reports/uiux/before/bundle.json`. Screenshots are in `reports/uiux/before/`.

- Environment: Apple M4, macOS/Darwin arm64, Node v24.19.0, Chrome 155.0.8059.85, headless, device scale factor 1; loopback network and no CPU throttling.
- Dataset: `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1`.
- Initial HTML/CSS/main-JS: 16,608 gzip bytes; Worker: 40,009 gzip bytes. No catalogue literal or private files in the web output.
- First navigation to catalogue-ready UI: 18,392.91ms, including automatic full installation. First DOMContentLoaded: 24.35ms. Five installed warm launches: 47.32–64.86ms to the measured ready state; zero catalogue chunk downloads during warm launches.
- Exact-code first UI query: 836.56ms; five cached repeats: 49.50–78.13ms. Name query first: 1,825.50ms; five cached repeats: 52.46–66.21ms. Timing includes browser automation and waits for the expected count and bounded cards; it is not an API latency measurement.
- Nine real before screenshots, two themes, 1440×1000 and 390×844 overview/results views plus the mobile vehicle picker.
- No page errors in that baseline workload. Keyboard ambiguity was reproduced. Other listed code defects are inspection findings unless explicitly identified as observed.

No real Android device, Android keyboard, WebView, screen reader, or complete accessibility conformance audit was performed. After screenshots and redesign results do not exist yet.

## Implementation review — 2026-10-27

This is the historical before audit; the findings above describe the original UI. The user subsequently authorized implementation. U01–U12 have corresponding changes in the live app: explicit vehicle selection, cancellation guards, no-op context preservation, optional first install with bounded online search, verified shell/catalogue status, compact rows, wrapping presets, readable code/price groups, labelled copy feedback, bounded native details/families, and real version metadata. Full results and remaining platform coverage are in `verification-report.md`.

The final local skill review inspected actual light/dark mobile/desktop screens and the browser accessibility tree. It led to corrections for smaller metadata, narrow-width copy hit areas, desktop form density, code-mark layout, shell cache revision ownership, summary accessible naming, reopening the vehicle list with arrow keys, and avoiding a history navigation during dialog teardown. Native Android/assistive technology claims remain explicitly out of scope of the executed evidence.

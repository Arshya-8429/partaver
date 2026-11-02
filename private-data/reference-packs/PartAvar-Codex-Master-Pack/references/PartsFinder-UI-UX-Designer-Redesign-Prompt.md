# PartsFinder - Professional UI/UX Redesign with UI UX Designer

## Mission

Use the installed **UI UX Designer** plugin to redesign and implement the real PartsFinder application in this workspace. Act as a product designer and frontend engineer. Deliver a polished, usable application, not a landing page, a generic dashboard, a screenshot-only concept, or a CSS reskin.

Working user assumption: Persian-speaking automotive-parts staff performing repeated, time-sensitive catalogue lookups on Android phones and desktop browsers. Optimize for finding the correct part, checking its exact logistics entry, reading its prices and fitment, and copying its code with minimal effort.

Communicate with the user in Persian. Keep technical documentation and code identifiers in English. All customer-facing interface copy must be natural Persian unless it is an original technical code, vehicle designation, or established product name.

## 1. Read the project and activate the actual plugin

- Inspect repository instructions, the current application, installed dependencies, existing tests, and the original `PartsFinder_Android-28 (1) (1).html` when present.
- Read `PartsFinder-Codex-Migration-Plan.md`, or the equivalent extracted architecture documents, especially the search contracts, frontend/offline rules, and data-preservation requirements.
- Discover and invoke the actual installed **UI UX Designer** plugin capabilities relevant to UX auditing, application flows, design systems, responsive layouts, dark mode, accessibility, and design review. Follow its real instructions; never invent skill names or invocation commands.
- Use the plugin during the initial audit and the final review. Identify the capabilities actually used in the delivery report. If plugin invocation is unavailable or fails, report that limitation and ask before substituting a plugin-free workflow. Do not pretend the plugin was used.
- The provided screenshot identifies the plugin. It is NOT a visual reference for PartsFinder and is not evidence that every advertised integration is available.

## 2. Scope override and architectural boundaries

This is an explicit follow-up authorization to redesign PartsFinder's UI and UX.

**This instruction supersedes earlier requirements to preserve the old appearance, CSS, spacing, component layout, and screenshot baselines. It does NOT supersede database, migration, search-ranking, pricing, security, or offline-correctness requirements.**

Preserve the existing TypeScript/Vite frontend, Node.js/Fastify backend, SQLite catalogue, Dexie/IndexedDB offline replica, Worker search, and repository contracts where implemented. Do not introduce React, Next.js, a heavy UI framework, a replacement backend, or a new database solely for visual redesign. If the workspace differs, inspect it and adapt to its actual structure rather than generating a parallel project.

Work incrementally. Preserve unrelated user changes and the original source archive. Do not restart a completed migration, alter catalogue records, or run destructive imports. Do not expose private source files or publish externally. No public deployment, commit, push, or APK release is authorized by this prompt.

If migration is incomplete, keep the UI behind the agreed repository interfaces. Report integration blockers instead of hiding them behind mock data or restoring the giant inline database.

## 3. Visual direction

Build a **precision-focused automotive catalogue application**: compact, calm, professional, legible, and purpose-built for daily work.

Use neutral surfaces, restrained borders and shadows, and a controlled blue accent. Design light and dark themes together. Give the product a recognizable visual hierarchy through typography, alignment, rhythm, and clear interactions rather than decoration.

Avoid oversized headers, marketing heroes, full-screen gradients, excessive glass blur, neon effects, decorative vehicle photos, fake analytics, empty sidebars, floating ornaments, and unrelated dashboard widgets. Do not add fabricated inventory, stock availability, sales, accounts, checkout, CRM, or AI-chat functionality. Do not fabricate part images where the data contains none.

Retain PartsFinder's identity and the existing designer credit. Correct `desing by behrad` to `design by behrad`. Do not rebrand it as another company. Drive version and catalogue counts from actual metadata, not hardcoded badges.

Before implementation, use the plugin to produce a concise audit and a written redesign proposal with the mobile and desktop layouts, tokens, component states, and preserved workflows. Follow any mandatory design-approval gates in the workspace. After approval, implement and verify the design; do not treat the proposal as the final deliverable.

## 4. Information architecture and search workspace

Keep a compact application header containing the product title, meaningful catalogue/offline status, and theme control. Hide nonessential technical version details behind an accessible information control or compact footer.

Preserve two clearly differentiated search modes:

1. Part name with a selected vehicle.
2. Global technical-code or part-name search without requiring a vehicle.

Use concise Persian labels. Do not make users read paragraphs before searching. Show a small example or contextual hint only where useful.

Vehicle selection must support searchable suggestions, exact selected-vehicle state, clear/reset, and the existing family/preset structure. Preserve the actual vehicle-option memberships, including distinct X33 Cross CVT/MT choices and the existing Tiggo 7 Pro Max AWD naming projection. Do not collapse trims merely to simplify the design.

Make the quick-family area compact and discoverable. Prefer wrapping controls or an accessible "more vehicles" disclosure over an overflowing horizontal strip. Every family and variant must remain reachable.

Use a genuinely accessible combobox: keyboard navigation, Enter selection, Escape dismissal, active-option announcement, clear selection, and reliable touch interactions. Separate focus from committed selection.

Keep Enter and the search button immediate. Preserve the migration plan's 180 ms suggestion debounce, request cancellation, stale-response protection, and version-pinned results. Distinguish loading, no results, invalid input, and failures. Do not display "no results" while a search is still running.

Changing mode or clearing a search must not clear the installed catalogue. Cancel pending work so late responses cannot repopulate cleared or different-mode results.

## 5. Results and part details

### Result layout

On mobile, use compact full-width rows/cards with a clear reading order: part name, technical code, logistics identity where applicable, prices, and a restrained details action. Show enough information to compare useful results without excessive scrolling.

On desktop, use a denser result list with an optional adjacent details panel. Avoid stretching mobile cards across a huge canvas or adding an unnecessary navigation sidebar.

Use the existing bounded pagination: 20 top-level results/families per page. Replace the visible page instead of appending the entire catalogue. Keep additional results reachable. Show total matched entries, family count, and currently displayed items as different concepts, never interchangeable counts.

### Identity and fitment correctness

A technical code, a logistics code, and a display-only code family are different concepts. Make that distinction understandable in the UI.

- Never imply that sibling logistics entries share one price or one vehicle-compatibility list.
- Associate every price and fitment block with its actual logistics entry.
- At family level, show a neutral summary. Any preview price must identify the entry it belongs to; otherwise omit it until an entry is selected.
- Keep the complete original technical/logistics strings. Preserve leading zeroes and meaningful suffixes.
- Treat `-01` as an ordering preference, not "latest", "best", "genuine", or a verified fitment guarantee.
- Code-family grouping is display-only. Replacement codes are source references, not automatically verified interchangeable parts.
- Missing vehicle assignments must appear as unavailable information, not universal compatibility or proof that the part fits no vehicle.

Do not rewrite domain ranking in presentation code. Reflect exact versus partial matches only from trustworthy search-result information. Preserve the full result set and its domain ordering.

### Prices

Show base, middle, and final prices together with explicit labels. Give the final price modest emphasis; use typography and labels, not color alone. Both markups derive from base: middle +10%, final +20%. Do not compound percentages.

Consume tested domain prices/formatting without lossy conversions. Handle very large values and unknown values. Do not truncate meaningful digits. Do not guess Rial/Toman, a price-effective date, stock, or availability. Unknown units and dates must remain clearly unknown. Catalogue installation time is not price validity.

Keep the price group compact when it fits. At narrow widths or large text sizes, allow deliberate stacking rather than tiny text or horizontal overflow.

### Details and actions

Use lazy-loaded details: at most 10 variants per family page and 10 logistics entries per variant page, with access to later pages. Collapsed components must not pre-render all their descendants.

For mobile, use an accessible full-height or near-full-height detail sheet when appropriate; for desktop, a details panel or dialog. Preserve query, vehicle, result page, and scroll position on return. Provide a visible close action, correct focus restoration, Escape support, and predictable browser/Android-back behavior without trapping users.

Add working copy controls for technical and logistics codes. Copy the exact raw value, never a visually shortened representation. Show success only after successful copying; otherwise offer selectable text and an honest error. A copied part summary must retain the selected entry identity and explicit price labels.

## 6. Responsive layout and Persian typography

Test widths of 320, 360, 390, 430, 768, 1024, and 1440 CSS pixels. There must be no unintended page-level horizontal scrolling. Fix intrinsic sizing, wrapping, and layout constraints; do not hide overflowing content with a global `overflow-x: hidden` workaround.

Use Persian RTL for the interface and isolated LTR regions for codes, Latin vehicle names, and appropriate numeric groups. Mixed text must not reorder identifiers. Keep codes readable and copyable, with safe wrapping for long strings rather than forced tiny type.

Use existing system fonts with a suitable Persian fallback; a properly licensed, self-hosted Persian font may be added only with a measured benefit. Do not bundle proprietary San Francisco fonts. Use tabular numerals and a readable monospace stack for technical codes.

Design targets: body text approximately 14-16 px, important codes 14-16 px, metadata 12-13 px, inputs 16 px, and touch hit areas at least 44 x 44 CSS pixels. Compact visual controls may have larger invisible hit areas. These are design targets, not permission to clip text or disable zoom.

Use a consistent 4/8 px spacing rhythm, approximately 12-16 px mobile gutters, and restrained corner-radius levels. Allow text enlargement and zoom; remove viewport settings that prevent it.

Keep primary search actions usable with the Android keyboard open. Sticky regions and safe-area padding must not cover focused inputs, dropdown options, pagination, or result details. Avoid nested scroll containers except for a purposeful dialog or suggestion list.

## 7. Design system, themes, and motion

Create semantic CSS tokens for canvas, surfaces, elevated surfaces, borders, primary/secondary/muted text, accent, focus ring, selection, positive/warning/error states, spacing, radius, elevation, typography, and motion. Use them across every component instead of scattered one-off values.

Both themes must cover inputs, native controls where applicable, suggestions, chips, disabled states, skeletons, tooltips, toasts, dialogs, family variants, prices, errors, and offline/update surfaces. No accidental white panels in dark mode and no dark-on-dark text.

Check contrast, keyboard focus, reading order, labels, and assistive-technology semantics. Aim for WCAG AA and verify the relevant criteria; do not claim conformance solely from a palette or automated score. Announce search status and copy feedback without overwhelming screen readers.

Use restrained opacity/transform transitions, usually 120-200 ms. Respect reduced-motion preferences. Avoid heavy blur, large filters, perpetual animations, and expensive height/layout effects on result collections. Hover must not be required for essential controls; touch feedback must stay subtle and must not interfere with scrolling.

## 8. Offline and update UX

Treat connectivity and offline readiness as separate states. A green connection icon is not proof that the app can run offline. Show readiness only when the shell and local catalogue are verified installed.

Represent the actual installer states: `empty`, `downloading`, `importing`, `indexing`, `validating`, `ready`, and `failed`. Preserve last known valid catalogue metadata independently of an in-progress or failed update.

Provide clear UX for first installation, no installed data while offline, update available, update in progress, interruption, retry/resume, insufficient storage, and successful activation. Use real progress when measurable and an indeterminate state otherwise; never fabricate percentages.

A valid old catalogue must remain searchable during update and after an update failure. Do not offer destructive reset as the default remedy. Keep warnings concise and recoverable. Show unavailable backend/update actions honestly instead of decorative buttons with no implementation.

## 9. Performance and implementation boundaries

Keep data access in application/repository services, not UI components. Reuse actual search, pricing, normalization, catalogue-version, and update contracts. Avoid parallel UI-only search logic or duplicate state stores that drift from domain state.

Never import the original DB, a complete JSON catalogue, or all database rows into the initial frontend bundle or main-thread startup state. Do not rebuild search indexes for each render or keystroke. Keep current worker-based processing, cancellation, version boundaries, and cache limits.

Prefer small framework-free components/modules for the shell, search modes, vehicle combobox, presets, result list, entry card, price group, family details, catalogue status, theme switch, dialog, and toast. Adapt file names to the existing project.

Use a small consistent SVG icon set. No icon fonts or remote CDN dependency for essential offline UI. Avoid a heavy animation/component package for features achievable with native elements and CSS. Render catalogue strings safely; visual redesign must not introduce unsafe HTML injection.

Measure UI bundle size and representative interaction timings before and after using the same environment and catalogue version. Report actual measurements and regressions, not invented speedups.

## 10. Verification and deliverables

Discover and run the project's actual lint, typecheck, unit, integration, E2E, and build commands. Write/update tests for new interactions and bug fixes. Intentional visual baseline changes are expected; data and behavioral regressions are not.

Test both themes and relevant viewport widths. Include:

- Both search modes, vehicle presets, exact/partial codes, Persian/Arabic digits, mixed-script input, rapid changes, clear, and no results.
- Shared technical codes with different logistics prices/fitment, missing vehicle assignments, long part names, long codes, large prices, and family/entry pagination.
- Fixtures from the real source, including `0CF25BE-1500011BA` and `111100001AA` where present; do not invent production records to make the interface attractive.
- Keyboard/combobox/dialog focus, Android-keyboard layout where testable, back navigation, text enlargement, copy failures, and reduced motion.
- Offline relaunch after installation, unavailable initial data, interrupted updates, storage errors, retained active versions, and cancellation across version changes.
- No page-level overflow, no hidden clipped prices/codes, no mismatched loading states, and no unexpected console/runtime errors.

Use **UI UX Designer** for a final review of the implemented screens and flows. Address concrete findings. A plugin review is not a replacement for running browser tests.

Deliver:

1. Implemented, integrated UI/UX in the existing project.
2. `docs/uiux/redesign-spec.md`: rationale, flows, responsive behavior, and source-versus-new-design decisions.
3. `docs/uiux/design-system.md`: tokens, typography, components, themes, and interaction states.
4. Real before/after browser screenshots for mobile and desktop in both themes, captured at comparable viewports and data states.
5. `docs/uiux/verification-report.md`: actual commands/results, performance measurements, preserved data rules, limitations, and untested environments.

Do not claim real-device Android testing from browser emulation, full accessibility compliance from an automated check, or successful functionality from a mockup. Do not stop with recommendations, static mockups, placeholder components, or nonfunctional controls. If something genuinely blocks implementation, identify it precisely and preserve the working application.

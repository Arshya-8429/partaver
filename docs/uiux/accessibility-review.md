# Accessibility review

Final source review: 2026-10-28. Recorded automated/keyboard/layout checks pass within the scope below. This is not full WCAG conformance or a manual screen-reader audit. Final release artifact verification is tracked separately.

## Passed evidence and method

[Final browser report](../../reports/release-2026-10-28/browser/browser-release-report.md) and [case matrix](../../reports/release-2026-10-28/browser/combined-case-matrix.json): 27 unique latest-pass scenarios, nine each in Chromium 156.0.8078.48, Firefox 157 and Playwright WebKit 27.2. The matrix combines initial and focused follow-ups; it is not one 27-case green run. Final online/document, layout/pageerror and axe checks ran in all three engines after the ResizeObserver correction: [nine focused final checks](../../reports/release-2026-10-28/browser/final-code-results.json).

Axe-core 4.14.0 audited 36 app/site/combobox/dialog/workspace states per engine, **108 audits with zero automated violations**. Rule scope: WCAG 2 A/AA, WCAG 2.1 A/AA and best practices. Per-engine summaries and complete state results remain in the browser evidence directory. This rule set does not establish WCAG 2.2 conformance or manual usability.

| Area | Recorded behavior |
| --- | --- |
| Language/bidi | Persian `lang=fa`/RTL; exact raw codes and Latin designations isolated LTR; full integer prices |
| Keyboard/skip links | Focusable main landmark, working skip action, visible focus, search tabs and explicit combobox selection with Arrow/Enter/Escape |
| Suggestions | Labeled custom listbox/active descendant, no critical native datalist; no hover-only required action |
| Details and feedback | Named native dialogs, focus restoration/Escape/Back, named copy controls and truthful success/failure status |
| Price history | High/medium/low/neutral text labels plus color, focus/tap details and version-bound evidence |
| Responsive/enlarged content | Both themes, widths 320/360/390/430/768/1024/1440 CSS px, 200% text/CSS enlargement and zoom; full codes/prices remain contained |
| Target/motion | Approximately 44px controls in measured visible states, reduced-motion behavior |
| Public pages | Native route navigation, meaningful headings/alt, empty real preview and useful image-failure fallback; accessible wordmark name includes visible PartAvar text |
| Contrast | Rendered axe checks supplemented by retained [semantic token pairs](../../reports/uiux/after/palette-contrast.json) and [site pairs](../../reports/partavar/site-contrast.json) |

Exact final 390×844 and 1440×1000 app screenshots in both themes are listed in [final-viewport-screenshots.json](../../reports/release-2026-10-28/browser/final-viewport-screenshots.json); extra mobile result views show full code/price cards.

## Corrected findings and retained initial failures

Genuine source corrections include skip-link focus transfer, the public wordmark's accessible name, container-width layout at 200% zoom, and synchronous ResizeObserver feedback. History/version and cross-tab corrections also prevent incorrect/stale operational states. Their red→green evidence remains in the [browser report](../../reports/release-2026-10-28/browser/browser-release-report.md).

The initial Firefox inline `bdi` width failure was a harness measurement issue: inline clientWidth=0 was compared with scrollWidth despite actual text fitting its rectangle. The corrected test checks meaningful boxes and text containment. WebKit fixture failures involved Service Worker interception; synthetic routed fixtures now block SW while actual offline tests retain it. Initial WebKit ephemeral quota refusal was correct behavior, not a successful install or a hidden source failure. Earlier diagnostic runs were preserved rather than overwritten by claims of initial success.

DevTools/Lighthouse final artifacts are linked from the browser directory. Automated scores do not establish coverage of every interaction or assistive technology.

## Failed / blocked / not tested

- No open source failure remains in this scoped automated/keyboard gate; final ZIP verification remains separate.
- VoiceOver/TalkBack/NVDA/JAWS listening and interaction were not tested. Role/name checks are not screen-reader certification.
- Real Android/WebView software keyboard, OS font scaling/high-contrast settings, one-handed reach and low-memory target behavior remain unavailable. adb was absent; connected physical devices could not be enumerated.
- Actual Safari 18.3 WebDriver session was refused because “Allow remote automation” is disabled. No setting changed. Playwright WebKit on macOS is not actual Safari/iOS coverage.
- Native Android print UI, real printer accessibility and full WCAG 2.2 AA conformance have not been audited.
- Company historical XLSX was unavailable. Missing history stays neutral; synthetic fixtures are labeled and isolated.

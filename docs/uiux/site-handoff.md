# PartAvar website implementation handoff

## Integration contract

`apps/web/src/website/index.ts` exports `renderWebsite(root: HTMLElement): void`. It imports `apps/web/src/styles/website.css`. The root receives `.public-website`, a header, one main landmark, and a footer. Parent entry selects this renderer for public routes and calls the existing `initializeTheme()` once after rendering. The website creates the shared `#themeToggle` and does not register a theme listener. The application stays at `/app`.

Public routes: `/`, `/product`, `/features`, `/offline-data`, `/support`, `/contact`. Trailing slashes normalize for rendering. Unknown public paths render an explicit page-not-found view and a `noindex, follow` robots directive. The site does not claim that a client-side page sets the HTTP status to 404.

All navigation is native anchor navigation. Same-page help links use real IDs. The rendering step restores cross-route anchor scroll after the dynamic HTML is present. Title, description, and factual Open Graph metadata update for each route. No fabricated host, canonical, organization schema, contact, pricing, login, metric, or testimonial is generated.

## Foundations and component specification

Shared color values come from `app.css`; website CSS reads semantic tokens. Site-owned tokens are layout spacing only.

| Token / foundation | Light | Dark | Use |
| --- | --- | --- | --- |
| `--canvas` | `#f5f7fa` | `#0c1422` | Page canvas |
| `--surface` | `#ffffff` | `#131f30` | Panels, bands, buttons |
| `--text` | `#152238` | `#ecf2fa` | Headlines and primary content |
| `--secondary` | `#45556c` | `#b5c3d7` | Supporting prose |
| `--muted` | `#5d6b80` | `#9baec6` | Metadata and quiet labels |
| `--accent` | `#1d4ed8` | `#84acff` | Primary action and active links |
| `--on-accent` | `#ffffff` | `#0c1422` | Primary action text |
| `--control` | `#8596ab` | `#637a97` | Outlined button boundaries |
| `--focus` | `#2563eb` | `#a2c0ff` | 3px visible focus ring |
| `--site-space-1..7` | 8/16/24/32/48/64/96px | Same | Layout rhythm |
| Type | Tahoma, Segoe UI, Arial, sans-serif | Same | Persian system font; no network font |
| Display | 32–60px desktop; 30–34px phone | Same | One H1 per page |
| Body | 14–19px; line height around 1.95 | Same | Comfortable Persian reading |
| Radius | 7–12px | Same | Restrained technical surfaces |
| Layout | 1200px cap; 24px sides, 16px phone | Same | Responsive container |

## Component states

| Component | Anatomy / variants | States and behavior | Accessibility |
| --- | --- | --- | --- |
| Wordmark | Latin PartAvar with accent dot; Persian text | Persian companion omitted at narrow widths, accessible home name retained | Text only, home link, Latin isolated LTR |
| Header navigation | Route links plus separate app CTA | Desktop inline; collapsed below 980px; active route labeled | Named nav, `aria-current=page`, targets at least 44px |
| Mobile menu | Labeled button controlling real nav | Closed/open via `aria-expanded`; in-flow expansion; Escape closes and focuses button | No overlay or focus trap needed; hidden links leave tab order |
| Theme | Shared `#themeToggle` icon button | Existing app initializer owns system preference, click, persistence | Initial accessible name; shared initializer supplies current action label |
| Primary action | Accent fill, text, left-pointing arrow | Default, hover, focus-visible | Native link, named destination, 48px height |
| Secondary action | Surface, control border, arrow | Default, hover, focus-visible | Same as primary; no disabled decorative CTA |
| Feature card | Icon, title, copy, optional link | Static content; hover styling only on actual link | Article, heading, reading order |
| Real preview | Browser frame, actual screenshot, caption | Image hidden until load; persistent help fallback on error | Natural alt, intrinsic 1440×1000, no fabricated screen |
| FAQ | Native details/summary plus answer | Closed/open by pointer or Enter/Space | Built-in expanded semantics, visible focus |
| Missing route | Clear heading, explanation, home/help actions | `data-site-page=not-found`, noindex | One H1, useful destinations |

The public site has no data input form, loading spinner, success toast, modal, account, or fake submission state. The preview is the only asynchronous content; failure stays usable. Do not add a status badge that implies live catalogue health: the site makes no catalogue request.

## Responsive rules

- 1100px: tighter header and section gaps.
- 980px: mobile navigation control and wrapping header; navigation opens in page flow.
- 768px: single-column feature/process layouts, stacked CTAs, reading-focused support content.
- 360px: stacked hero principles and footer actions.
- All grid/flex children can shrink; no global `overflow-x: hidden` workaround.
- The support aside is supplementary and hidden below 980px; all actual guidance remains in the main support column.
- No sticky header or CTA obscures text; no autoplay or decorative animation.
- Reduced-motion media query removes transitions. Focus rings remain visible in both themes.

## Assets

Parent supplies the optimized real empty application capture at `apps/web/public/website/app-preview.webp`. Intrinsic markup dimensions are 1440×1000. The full image fits without cropping. If the source canvas changes, update these dimensions and aspect ratio together. The screenshot must contain no private rows, codes, prices, invoices, or source paths. All icons are original inline geometric SVGs with `aria-hidden=true`; they convey no standalone status.

## Governance and limits

New public styles use the `site-` prefix and live inside `.public-website`; semantic colors stay shared with the app. Add a new shared token only if both surfaces require it. Add new site routes to the central page map, main navigation as appropriate, metadata, and browser test route list together.

Rendering is client-side, so production SEO needs crawler testing and server fallback/status review. No domain or verified external contact was supplied. The contact page explains this and provides real internal guide links. No public deployment or Git push is part of this work.

Actual verification status and QA findings belong in `site-verification.md`; this specification is not proof of a passed browser or assistive-technology audit.

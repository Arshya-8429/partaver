# PartAvar public website direction

Date: 2026-10-27. Implementation proposal recorded before website code. The user authorized execution of the master pack; this document is a design input, not a new approval gate.

## Brief and evidence

PartAvar serves Persian-speaking automotive-parts sales and purchasing staff. The public site explains the product and leads visitors to `/app`; the application remains the compact work surface. The existing workspace contains the application but no separate public website. This site extends the existing Vite project using native HTML, CSS, TypeScript, local assets, and shared semantic theme tokens.

Source requirements: master-pack files 00, 01, 06, 07, 09, 10. No company contact, approved graphic logo, pricing model, public domain, testimonials, customer references, or usage metrics were supplied. Use the PartAvar / پارت‌آور text wordmark, factual product copy, and configuration guidance on the contact page.

## Installed plugin provenance

Actual local skills read and applied from `/Users/barmana/.codex/plugins/cache/openai-curated-remote/uiuxdesigner/1.1.0/skills/`:

| Skill | Applied method | Result |
| --- | --- | --- |
| `ui-ux-designer/SKILL.md` | Brief, user goal, structure, hierarchy, states, accessibility | Persian RTL pages with one clear primary app entry |
| `website-ui-design/SKILL.md` | Sitemap, shared elements, reusable sections, responsive rules, visual style | Six public pages plus an honest unknown-route page |
| `redesign-makeover/SKILL.md` | Current-state audit, scope, new direction, preserved recognition | Spacious site related to the shared technical app identity |
| `design-system-builder/SKILL.md` | Semantic foundations, component anatomy/states, patterns, governance | Scoped website tokens and component specifications |
| `design-handoff/SKILL.md` | Screen list, layout, states, interaction, assets, accessibility, QA | `site-handoff.md` and `site-verification.md` |
| `accessibility-audit/SKILL.md` | Contrast, keyboard, semantics, target sizes, motion, resize | Review checklist and browser assertions; no conformance claim |

These installed skills are Markdown workflows, not an external design-generation API. No invented plugin command or external generator is used. Their affiliate footer requirement applies to assistant replies, not to product content.

## Current-state audit and selected approach

| Existing situation | Change | Reason |
| --- | --- | --- |
| Root is the catalogue work surface | Parent routes `/app` to the work surface, public routes to this module | Visitors can understand the product before entering it |
| Operational density works inside the application | Public layout uses generous section spacing and editorial hierarchy | Product explanation is a different task from repeated lookup |
| Exact logistics identity matters | Explain technical/logistics distinction without publishing records | Show product value without exposing confidential catalogue data |
| No supplied contact channel | Explain how to reach the installation operator and link real help | Avoid a fake contact form or invented support address |
| No approved logo | Use clean bilingual text wordmark | Maintain honest brand provenance |

Selected approach: static route-specific HTML inside the existing Vite entry, with normal links and shared theme setup. This is lightweight, deep-linkable through the existing SPA fallback, and requires no framework or public-data API. A heavy CMS/framework adds setup without helping these six pages. A single long page would make support and offline guidance harder to link directly.

## Sitemap and visitor flow

| Route | Purpose | Main onward action |
| --- | --- | --- |
| `/` | Product value, real preview, workflow summary, data principles | `/app`, `/product` |
| `/product` | Explain the work cycle and the exact record identity | `/features`, `/app` |
| `/features` | Search, invoices, purchases, packages, price history | `/app`, `/support` |
| `/offline-data` | Honest readiness, verified updates, backup responsibilities | `/support#offline`, `/app` |
| `/support` | Real setup, lookup, offline, recovery, and backup guidance | Relevant guidance anchor, `/app` |
| `/contact` | Honest missing-contact state and useful support routing | `/support`, `/app` |
| Unknown public route | Explicit page-not-found explanation | `/`, `/support` |

Primary flow: discover value → inspect product/workflow → open application. Support flow: identify task → follow practical guidance → reopen application or contact the installation operator. No fabricated login, registration, payment, account, or pricing flow.

## Visual direction

Technical B2B, calm and precise. A blue accent and neutral technical surfaces continue the application's identity. Large Persian headlines, measured line lengths, horizontal section rules, restrained labels, and a real application screenshot establish hierarchy. No stock car imagery, simulated UI, fake chart, decorative KPI, customer logo strip, glass effect, or animated background.

The home hero uses an editorial text block and a compact factual navigation panel, followed by the real application preview. Workflow sections use a small repeated card/list system. Interior pages use a clear page introduction, numbered work steps, plain-language explanatory blocks, and contextual cross-links.

## Responsive and accessibility intent

The container is capped at 1200px with 24px side space, reduced to 16px on phones. Sections use an 8px spacing scale. Two/three-column layouts collapse to one column. Below 980px a labeled menu button reveals in-flow navigation; Escape closes it and restores focus. No sticky controls cover content. Every interactive target is at least 44px, and all links have visible focus and purposeful destinations.

Both themes inherit the app's semantic token values. A shared `#themeToggle` is rendered; only the shared initializer owns its listener. The document is Persian RTL; Latin branding is isolated LTR. Reduced-motion users receive no animated transitions. Main content has a skip link. The real screenshot has natural alternative text and a visible textual fallback if unavailable.

## Assets and public boundary

Only the real, empty application capture supplied by the parent is referenced at `/website/app-preview.webp` (1440×1000 intended source canvas). No private source, catalogue row, price, invoice, snapshot, database, or internal path is placed in website markup. No external asset or analytics request is introduced. The app preview fallback explains that the image is unavailable and preserves a working app entry.

Metadata is per route: Persian title/description, factual Open Graph title/description/site name/type/locale. No fabricated canonical host, organization schema, or company data is emitted. Unknown routes use `noindex`. Because rendering is client-side, crawler execution and a production server's actual HTTP status need deployment review.

## Review gate

Implementation is followed by meaningful browser checks for all routes, headings, metadata, real app entry, navigation, image readiness, theme persistence, keyboard escape/focus, both themes at 320/360/390/430/768/1024/1440, reduced motion, enlarged text, and absence of public API catalogue requests. Capture evidence only from the implemented site. Record passes, failures, and untested environments in `site-verification.md`.

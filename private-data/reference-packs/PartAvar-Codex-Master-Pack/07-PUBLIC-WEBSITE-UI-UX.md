# PartAvar - Public Website UI/UX Prompt

## 1. Objective

Design and implement a professional public website for PartAvar that is visually related to the application but clearly a different experience.

The site should present PartAvar as a serious automotive-parts software platform.

Do not simply reuse the internal application layout as the marketing site.

Use the installed UI UX Designer plugin and relevant `website-ui-design`, `redesign-makeover`, `design-system-builder`, `accessibility-audit`, and `design-handoff` capabilities when available.

---

## 2. Visual direction

Website may be more spacious and expressive than the application while remaining professional.

Direction:

- modern technical automotive B2B,
- confident typography,
- strong content hierarchy,
- restrained premium surfaces,
- clean illustrations/diagrams or real product screenshots,
- controlled PartAvar accent color,
- subtle motion.

Avoid:

- copied competitor layouts,
- fake 3D supercars,
- random stock-car imagery dominating every page,
- fake customer logos,
- fake testimonials,
- fake usage metrics,
- generic AI-neon styling,
- excessive glass effects.

---

## 3. Suggested sitemap

Implement a multi-page or clean routed site containing at minimum:

- `/` Home
- `/product` Product overview
- `/features` Features/workflows
- `/offline-data` Offline & data integrity
- `/support` Support / documentation entry
- `/contact` Contact
- `/app` application entry or redirect

Do not add a pricing page unless the user later provides a pricing model.

If auth/login exists in the real workspace, expose the legitimate login route. Do not invent an insecure fake login screen.

---

## 4. Home page structure

Recommended sections:

1. compact professional header,
2. hero with clear value proposition,
3. real application preview/screenshots after implementation,
4. core workflows,
5. catalogue/search accuracy section,
6. invoice / purchase / package section,
7. historical price intelligence section,
8. offline reliability section,
9. trust/data integrity section,
10. CTA to enter/contact,
11. footer.

Hero copy should communicate operational value, not generic slogans.

Example message direction, not mandatory final copy:

> جست‌وجوی دقیق قطعات، قیمت‌گذاری، فاکتور و تحلیل روند قیمت در یک سامانه حرفه‌ای.

Use natural Persian copy.

---

## 5. Product screenshots

Do not fabricate UI screenshots.

After the application redesign is implemented, capture real screenshots and use optimized versions on the website.

Screenshots may show:

- search result card,
- vehicle picker,
- invoice builder,
- package builder,
- price-history badge/detail,
- offline update status.

Protect confidential catalogue data in public screenshots if required by the user's access policy.

---

## 6. Shared brand system

Website and app should share:

- PartAvar wordmark/logo when approved,
- core accent colors,
- typography family,
- icon language,
- semantic state colors.

They should differ in:

- density,
- spacing,
- page composition,
- marketing content.

---

## 7. Responsive design

Implement desktop/tablet/mobile intentionally.

Mobile website should not look like squeezed desktop.

Use:

- collapsed navigation,
- readable hero copy,
- one-column feature flow,
- properly scaled screenshots,
- accessible CTAs,
- no horizontal page overflow.

---

## 8. Performance

Keep website lightweight.

- no giant autoplay video by default,
- no heavy animation framework solely for decoration,
- optimize screenshots/images,
- lazy-load below-the-fold media,
- use local/essential assets,
- maintain good Core Web Vitals-oriented implementation.

Record actual build sizes and Lighthouse-like measurements only when actually run.

---

## 9. Accessibility and SEO basics

Implement:

- semantic headings,
- descriptive title/meta description,
- canonical route behavior where appropriate,
- Open Graph metadata,
- logical landmarks,
- keyboard navigation,
- focus states,
- contrast,
- alt text for meaningful visuals,
- reduced motion support.

Do not keyword-stuff.

Do not fabricate schema/org facts not supplied by the user.

---

## 10. Public/private boundary

The marketing site may be public.

Catalogue data, internal prices, invoices, source Excel files, private snapshots, and admin import tooling must not accidentally become public static assets.

Build/deployment configuration must keep private data outside the public site root.

No public deployment is authorized merely by this prompt. Prepare deployable output but wait for explicit deployment authorization.

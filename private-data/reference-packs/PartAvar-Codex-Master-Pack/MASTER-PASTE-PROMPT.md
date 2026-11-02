# Paste this message to Codex with the PartAvar ZIP attached

Implement the attached **PartAvar-Codex-Master-Pack.zip** in the existing PartsFinder workspace.

This is an implementation task, not a request for another proposal.

First inspect the real repository, git status, existing migration progress, tests, packages, database files, and any existing `PartsFinder-Codex-Architecture/` folder. If that folder exists, read every Markdown specification in it as well as the combined reference document in the ZIP. Preserve completed work and unrelated user changes; do not start a parallel replacement project.

Unpack the ZIP and read `00-MASTER-CODEX-EXECUTION-PROMPT.md` first. Then follow the exact read order defined there and treat all new PartAvar MD files as one coordinated specification.

The product is now branded **PartAvar / پارت‌آور**. The new scope explicitly includes:

- a professional Persian RTL PartAvar web application,
- a separate professional public PartAvar website,
- the complete catalogue/search migration,
- all vehicle models including non-primary/other models,
- invoice builder and history,
- purchase lists,
- Smart Packages and related-part suggestions,
- editable package pricing and package-to-invoice transfer,
- historical Excel price imports,
- green/yellow/red price-growth badges with detailed history,
- offline IndexedDB catalogue, Worker search, safe updates and rollback,
- complete light/dark responsive UI.

The old data-correctness rules remain non-negotiable. Technical codes and logistics codes are different identities. Never merge sibling logistics-entry prices or compatibility. Preserve raw values, leading zeroes, aliases, replacements, vehicle memberships and exact source prices. Do not inline the catalogue into frontend JS/HTML and do not hydrate all records on the main browser thread.

Use the latest supplied Windows and Android v3.0.1 HTML files as the current behavior reference for invoice, purchase-list, Smart Packages and UI interactions. Use the original legacy HTML and migration baseline for source-integrity verification. Compare embedded catalogue data between sources before choosing an import authority; if they differ, report the exact diff rather than silently choosing one.

Use the installed **UI UX Designer** plugin for the actual design work. Discover and invoke its real capabilities such as UX audit/redesign, dashboard/SaaS UI, mobile app UI, website UI, design-system, component, accessibility and handoff skills. Do not invent plugin commands or claim it was used if unavailable. The plugin is for design quality; real browser/database/tests are still required.

Do not remove the application Smart Suggestions feature. On Android/mobile, suppress intrusive browser/keyboard native suggestions while preserving PartAvar's own custom suggestion panel.

Do not stop at plans, schemas, mockups, TODOs, placeholder buttons or fake reports. Implement the working code, migrate and verify the data, run the real tests/build, capture real screenshots, measure actual performance, and produce the reports required by the pack.

Do not deploy publicly, push a release, or expose private catalogue/source files unless I explicitly authorize it.

Communicate with me in Persian. At the end, deliver working code plus the exact verification evidence and complete `10-FINAL-DELIVERY-CHECKLIST.md` status.

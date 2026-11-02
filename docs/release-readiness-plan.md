# Release readiness — 2026-10-28

Authority: existing PartAvar master specification and final delivery checklist; user authorized completing the release preparation on 2026-10-28. Public deployment remains a separate action requiring an actual destination.

1. Preserve the completed workspace and data; use the verified 2026-10-27 source/data ZIP as the checkpoint. This workspace has no Git repository; continue in place as required by the existing implementation plan.
2. Provide a production same-origin Fastify runtime, narrowly scoped static hosting, fail-closed access configuration, authenticated app/API/snapshot routes, origin restrictions, security/cache headers, generated operator credentials and graceful shutdown. Prove protections with real SQLite/snapshot HTTP integration tests.
3. Close material correctness defects discovered during the release audit, especially atomic offline update ownership. Add regression cases before fixes.
4. Verify current application flows with Chromium, Firefox and WebKit, keyboard/zoom and automated accessibility checks; fix material issues. Physical Android, platform Safari and screen-reader certification require those actual environments.
5. Provide repeatable source/data release packaging, consistent online SQLite copies, integrity manifest, relocation verification, production service/proxy examples and restore/rollback instructions. Verify tamper detection using disposable fixtures.
6. Run typecheck, lint, unit/integration/build/bundle/E2E checks, full source reconciliation and backup restore. Read a final independent review, fix material findings, consolidate evidence and every mandatory delivery item.
7. Generate and verify a fresh release ZIP including source, migrated SQLite, snapshots, original references, build outputs, tests, reports, operator documentation and a precise remaining-work status. Keep generated secrets outside artifacts.

## Interfaces and decisions

- Fastify protects `/app`, `/api`, `/health/ready`, `/sw.js` and `/manifest.webmanifest`. Public website/assets contain no private catalogue. Production startup requires an explicit origin and credentials. Authentication uses a randomly generated 256-bit operator token as the browser Basic password; only its SHA-256 verifier is configured. HTTPS is provided by the reverse proxy.
- All catalogue/database, price, identity, search ranking and offline constraints remain binding. Real historical company data is optional input, never synthesized as production history.
- Delivery is a prepared, verified private-hosting release. Public DNS/TLS issuance, actual customer device acceptance and company workbook approval can only be reported from the real target environment.
- Browser and packaging work can proceed independently of the API runtime; final build/test/packaging operations are coordinated to avoid mutating build outputs during a browser run.

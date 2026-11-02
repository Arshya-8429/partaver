# Final review resolution — 2026-10-28

Independent reviewer: [final-independent-review.md](final-independent-review.md). No Critical finding. Two Important findings were closed by the implementer; this is a recorded fix pass, not a claimed second independent review.

| Finding | Closure | Evidence |
| --- | --- | --- |
| Credentialless native manifest fetch returns401/empty data | Added use-credentials and192/512brand PNG metadata/allowlisted routes; real browser CDP reads native manifest and checks PNG bytes/dimensions under auth | [RED](install-manifest-red.log), [GREEN](install-manifest-green.log), [final full25](final-e2e.log), [manifest](production/install-manifest.json) |
| Primary runbook contradicts implemented auth/runtime/current tests | README,HANDOFF,operations and release guide now describe native same-origin Fastify, fail-closed production config, private credentials,Caddy and evidence bounds | [operations](../../docs/operations.md), [handoff](../../HANDOFF.md), [release report](../../docs/release-verification.md) |

Other material audit defects were fixed before delivery: lease ownership transaction fence, history version boundary, cross-tab activation synchronization and ResizeObserver feedback. Their RED/GREEN and all initial harness failures remain in [spec audit](spec-audit.md) and [browser report](browser/browser-release-report.md). Latest full core87/87 and Chromium25/25 passed; the separate browser matrix records27unique scenarios with latest relevant passes. No separate deferred minor finding was returned by the final reviewer.

## Rulings and limits considered

| Considered behavior | Ruling / reason | Cost or required follow-up |
| --- | --- | --- |
| No Git repository/worktree | Follow existing approved implementation plan in current workspace; preserve verified2026-10-27archive and new code/data checkpoints | Code rollback uses verified releases; no invented commit/branch history |
| Genuine company workbook | No production history invented; importer fixtures remain explicit tests | Company owner must approve mapping,date,unit and commit actualXLSX |
| Physical Android/WebView | Desktop engines/manifest tests are narrower evidence | Real handset install,keyboard,quota,print and lifecycle acceptance required |
| Safari/iOS | safaridriver automation disabled; settings unchanged; WebKit result labeled accurately | Product Safari/iOS acceptance remains external |
| Screen reader / WCAG | Automated108state audits and directkeyboard/zoom tests establish bounded coverage | ManualTalkBack/VoiceOver and fullconformance still required |
| Host DNS/publicTLS/systemd | Actual localTLS1.3 proxy21checks and relocatedruntime23checks passed; no destination provided | Destination operator performs DNS,certificate renewal,firewall,systemd and host acceptance |
| Offline revocation/encryption | Approved model permits authorized downloaded data to remain on device | Token rotation cannot erase offline data; operator controls devices/backups |
| Multi-userroles/recovery/logout/sync | Not part of accepted single-operator/local-document design | No cross-device synchronization or universal browserBasic logout promised |
| Hardware-independentperformance | Warm timings and cold8–9secondbroad query reported on one sharedhost; no legacybaseline | Field phone capacity/latency still needs measurement |
| Power loss/diskfull/adversarialfilesystem | Verified transactional/race/quota/corruption/restore cases; no physicalfailure or hostilelocalwriter claim | Trustedlocaldeploymentownership and realhost failure drills remain operator responsibilities |
| Fullsecurityproof | Bounded code review + registryadvisoryaudit only | Zero reported advisories does not certify all vulnerabilities or future releases |
| Publicrelease/remote push/APK | User authorized release preparation; no actual public destination action performed | Publish only against approved target; no nativepackage claim |

Native installability has credentialed manifest/icon evidence, not physical Android add-to-home-screen certification. WebKit's1GB ephemeral quota rejection is retained as correct failure handling; fulloffline evidence uses a real persistent profile and no quota override. better-sqlite3's explicit false build policy was restored after a clean-store experiment proved thatv13bundles prebuilt addons and the true policy caused an unnecessarynode-gyp rebuild.

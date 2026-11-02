# PartsFinder - Codex implementation handoff

This pack is based on the supplied HTML and read-only data extraction. It is a specification and task plan, NOT an already migrated application. The original HTML remains unchanged. There is no migrated production DB or backend binary inside this pack.

## What to give Codex

Keep the existing `PartsFinder_Android-28 (1) (1).html` in the workspace. Add this folder, or provide the combined `PartsFinder-Codex-Migration-Plan.md`, which contains the same documents and baseline JSON appendices.

Read order: architecture -> database/migration -> backend/search -> frontend/offline -> implementation plan -> verification/operations. Source notes distinguish observed facts from proposed decisions. Do not omit the migration rules and implement only a generic backend scaffold.

## Execution prompt

```text
Refactor the existing PartsFinder application in this workspace using the
attached PartsFinder-Codex-Migration-Plan.md (or the complete extracted
PartsFinder-Codex-Architecture folder) as the implementation specification.

The original application is PartsFinder_Android-28 (1) (1).html. Locate it
and inspect any existing project structure first. Preserve the original
file and all existing user work. Do not execute its scripts to import data.

This is an implementation task, not a request for another architecture
proposal. Implement the specification sequentially and deliver working
code, an actual migrated SQLite catalogue, and test/migration reports.

Use a modular TypeScript/Vite frontend preserving the current Persian RTL
UI, a Node.js/Fastify backend with SQLite, and a Dexie/IndexedDB offline
replica searched through a dedicated Web Worker. Do not add unnecessary
frameworks, microservices, Redis, Elasticsearch, accounts panels or a
native Android rewrite. No public deployment is authorized.

The critical migration rules are non-negotiable:
- Preserve every source row and all source metadata.
- Technical codes and logistics codes are different identities.
- Preserve each logistics entry's own price, models, friendly labels,
  aliases and replacement data; never union sibling fitment blindly.
- Preserve original raw strings and leading zeroes. Normalize only
  additional search fields.
- Preserve source prices without guessing Rial/Toman or effective dates.
- Both 10% and 20% prices derive from base with tested integer rounding.
- Keep the existing Tiggo 7 Pro Max AWD naming projection and -01 ranking.
- Code-family grouping is display-only, never a data merge or fitment rule.

Do not put the full catalogue in HTML, JS, or the initial bundle. Do not
load all database rows into the main browser thread at startup. Implement
indexed searches, bounded result pages, lazy details, and a real offline
install/update pipeline with atomic activation and rollback protection.

For this exact source hash, reconcile 36,569 rows, 31,509 technical codes,
36,569 logistics codes, 119 raw models, and every original row field. If
the source differs, regenerate the baseline and report the difference.
Matching counts alone are insufficient: verify full field-level hashes.

Follow 05-IMPLEMENTATION-PLAN.md task by task (or its corresponding section
in the combined document). Write regression tests before behaviour changes,
run the real commands, and record evidence. Preserve the working version
when import, update, network or quota handling fails. Do not claim a pass,
migration, offline support, performance improvement or APK without proof.

Finish with the runnable project, migrated database, exact verification
results, before/after measurements, run/update/backup/rollback instructions,
and a clear list of untested environments or blockers. Do not stop at
an empty schema, mock API, TODO-only offline implementation or a plan.
```

## Pack contents

| File | Purpose |
|---|---|
| `01-ARCHITECTURE.md` | Stack decision, boundaries, source facts and folder structure |
| `02-DATABASE-AND-MIGRATION.md` | Tables, field mappings, safe extraction and lossless reconciliation |
| `03-BACKEND-AND-SEARCH.md` | Repository/API contracts, indexes, search ranking and paging |
| `04-FRONTEND-AND-OFFLINE.md` | Worker/IndexedDB structure, staged updates and bounded UI |
| `05-IMPLEMENTATION-PLAN.md` | Seven independently testable implementation tasks |
| `06-VERIFICATION-AND-OPERATIONS.md` | Acceptance tests, target budgets, backup and deployment limits |
| `07-SOURCE-NOTES.md` | Source provenance, references and untested conditions |
| `baseline/source-inventory.json` | Measured source counts, values and SHA |
| `baseline/migration-fixtures.json` | Actual source rows for migration/search regression tests |

The full original 11.4 MB HTML is intentionally not duplicated in this pack.

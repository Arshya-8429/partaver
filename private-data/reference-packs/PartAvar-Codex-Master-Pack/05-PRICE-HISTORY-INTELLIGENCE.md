# PartAvar - Historical Price Intelligence

## 1. Goal

The user will provide historical company Excel files from different periods.

PartAvar must analyze price movement over time and show a compact signal on catalogue results so the operator can quickly see which parts have experienced stronger price increases.

This is a **price-movement signal**, not a guaranteed profit-margin calculation.

Do not label a part as high-margin unless actual cost/margin data exists.

---

## 2. Source import requirements

Support historical spreadsheet sources such as `.xlsx` and, where safely supported, `.xls`.

Imports must be staged and auditable.

For every file:

- compute SHA-256,
- store original filename,
- store import batch,
- detect sheets,
- map source columns explicitly,
- preserve raw code text,
- preserve leading zeroes,
- parse price with integer-safe semantics,
- determine effective date only from explicit trusted source information,
- record row-level match status.

Do not use upload/import time as the historical effective date.

If date is missing, require operator input or mark it unknown.

---

## 3. Matching identity

Current catalogue identity rules still apply.

### Preferred match

Match by exact logistics code when historical source provides it.

### Technical-code-only source

If a historical source only has technical code:

- find all candidate current/historical logistics rows,
- do not blindly copy the same observation to every sibling,
- use other explicit source fields such as part name/model/logistics hints if available,
- mark unresolved ambiguity rather than guessing.

Build an import reconciliation report:

- matched exact,
- matched by reviewed rule,
- ambiguous,
- unmatched,
- invalid price,
- duplicate source observation.

---

## 4. Observation model

Each valid observation stores:

- source reference,
- effective date nullable,
- raw price,
- normalized exact price,
- raw codes,
- matched entry identity,
- match method,
- source row/sheet reference.

Never overwrite older observations.

Deduplicate only exact repeated source evidence using stable keys/hash rules.

---

## 5. Metrics

For an entry with at least two chronologically ordered valid observations calculate:

- earliest observed price,
- latest observed price,
- absolute change,
- cumulative percentage change,
- previous-to-latest change,
- number of observations,
- min observed price,
- max observed price,
- first date,
- last date.

Do not annualize or extrapolate unless explicitly requested later.

Do not fabricate dates for undated observations.

---

## 6. Badge semantics

The requested visible badge states are:

- **Green:** high increase
- **Yellow:** medium increase
- **Red:** low or no increase

Add a neutral **gray** state only when there is insufficient/ambiguous history; do not misuse red to mean missing data.

### Classification must be configurable

Implement classification as a domain setting, not a CSS condition.

Support at least two strategies:

1. **Threshold mode**
   - operator defines low/medium/high percentage boundaries.

2. **Relative/percentile mode**
   - classify valid entries relative to the distribution of price changes over the chosen analysis population/window.

Choose one documented default in settings, but make the thresholds/mode editable without code changes.

Zero or negative cumulative increase should remain in the low/red class unless the operator config explicitly changes semantics.

---

## 7. Badge UI

Place a small badge in each result/entry card without making the card noisy.

Badge must communicate with more than color:

- icon or short label,
- accessible text,
- color.

Examples of labels:

- `رشد بالا`
- `رشد متوسط`
- `رشد کم`
- `سابقه ناکافی`

On desktop:

- hover/focus may show a tooltip preview,
- click opens full details.

On mobile:

- tap opens details,
- no essential data may require hover.

---

## 8. Price-history detail view

On click/tap show a compact detail sheet/panel with:

- current/latest price,
- first observed price,
- cumulative % change,
- last change %, if meaningful,
- observation count,
- time range,
- timeline/table of historical points,
- exact source file/date reference where appropriate.

A small line chart may be used only when there are enough chronological observations and it remains readable.

Do not smooth or interpolate missing price points in a way that implies observed data.

---

## 9. Filters and sorting

Add optional tools for:

- sort by price growth,
- filter green/yellow/red,
- filter by minimum observation count,
- filter by date range/window when supported.

Keep the default search workflow uncluttered.

These controls should help purchase-list and quotation decisions without turning the product into a generic analytics dashboard.

---

## 10. Package/invoice integration

Show the historical badge in package and purchase-list contexts where useful.

Do not automatically raise a quote price just because a badge is green.

Any suggested price action must be explicit and user-controlled.

The badge is decision support only.

---

## 11. Performance

Historical observation tables must not be bundled into the initial frontend JS.

Result search should receive only a compact precomputed summary such as:

- classification,
- cumulative change,
- observation count,
- first/last date.

Load the full timeline lazily when the user opens the badge/detail.

Index by matched catalogue entry and effective date.

Recompute summaries during import/publication rather than on every card render.

---

## 12. Verification

Tests must cover:

- leading-zero codes,
- shared technical code with multiple logistics entries,
- ambiguous technical-only historical row,
- exact logistics match,
- duplicate historical file,
- missing date,
- missing price,
- negative/zero change,
- large price values,
- configurable thresholds,
- percentile classification,
- neutral insufficient-data state,
- chronological ordering,
- no change to current catalogue price after history import.

Deliver a real import report for every historical Excel batch used in testing.

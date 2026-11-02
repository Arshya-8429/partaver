# PartAvar - Catalogue Search, Vehicle Selection, and Suggestions

## 1. Preserve both search modes

### Mode A - Vehicle + part name

Workflow:

1. choose vehicle/model/trim,
2. type a part name,
3. show ranked matching catalogue entries compatible with the selected vehicle.

### Mode B - Global code or part name

No vehicle is required.

Search:

- exact technical code,
- exact logistics code,
- normalized code,
- replacement reference where domain rules allow,
- partial code,
- part name,
- aliases/friendly terms.

Do not concatenate unrelated fields and then match across boundaries.

---

## 2. Vehicle picker - all models must be reachable

A known legacy issue is that the visible vehicle search can feel limited to the main/preferred models.

The new PartAvar picker must expose:

- preferred/main options,
- grouped family shortcuts,
- **all other raw models**, searchable from the same interaction,
- all valid trims/variants.

The original source contained `primary`, `others`, `groups`, and `primaryOptions` concepts. Preserve their domain meaning but do not use `primaryOptions` as the complete model universe.

Search suggestions should clearly label whether an item is a preferred option, family, or other/raw model when that distinction helps.

No model can become unreachable simply because it is not in the primary list.

---

## 3. Vehicle naming rules

Preserve tested projections, especially the legacy Tiggo 7 Pro Max AWD behavior.

Do not merge similar-looking labels without an explicit mapping rule.

Do not infer AWD/PHEV/trim fitment from naming similarity.

Preserve raw source values separately from display/canonical labels.

---

## 4. Search normalization

Centralize normalization in domain code used by server and browser worker.

Handle:

- Persian and Arabic digits,
- Latin digits,
- Persian/Arabic letter variants,
- whitespace normalization,
- punctuation/code separators,
- case-insensitive Latin matching,
- exact raw-code preservation.

Normalization fields are additional search keys. Never overwrite raw stored identifiers.

---

## 5. Ranking contract

Preserve legacy behavior unless tests approve a change.

General ordering intent:

1. exact code identity matches,
2. strong part-name exact/phrase matches,
3. phrase-start matches,
4. contains/token matches,
5. weaker matches.

Preserve `-01` preference as a ranking signal, not a filter.

Preserve the existing later price tie-break only as a deterministic legacy tie-break; do not label it newest/better.

If server and offline worker produce different ordering for the same catalogue version/query, treat it as a bug.

---

## 6. Bounded queries and rendering

Default top-level page size: 20 unless a tested product decision changes it.

Do not:

- return 36k records to the UI,
- append unlimited pages to DOM,
- pre-render thousands of hidden variants,
- keep the entire catalogue in a UI array.

Use lazy details and bounded variant/entry pagination.

Cancel stale queries with sequence IDs/AbortSignal.

Rapid typing must never allow an older result set to overwrite a newer query.

---

## 7. Code families

Code family grouping is visual only.

It may help users inspect suffix/variant relationships, but must not:

- merge prices,
- merge model fitment,
- infer replacement,
- infer interchangeability.

Show the exact logistics entry before pricing/fitment actions.

---

## 8. Result card requirements

Compact result card should expose:

- part name,
- technical code,
- logistics code,
- base price,
- middle +10%,
- final +20%,
- vehicle summary,
- price-history badge,
- copy controls,
- add to invoice,
- add to purchase list,
- related-parts/package action.

Long details belong in a lazy detail sheet/panel.

Codes must remain exact, selectable, copyable, LTR, and visually distinct.

---

## 9. Smart related-part suggestions must remain

Do **not** remove PartAvar's application-level related-part suggestions.

The user previously requested that only the intrusive keyboard/browser suggestions be removed, not the product feature.

Required related-parts behavior:

- after adding/selecting a part, show 2-5 strong related suggestions,
- filter by the selected vehicle when a vehicle context exists,
- only suggest parts that actually exist in the catalogue,
- show actual code/entry choices,
- if multiple valid logistics entries exist, require the user to choose instead of guessing,
- allow add-one and add-all-certain actions,
- show an explicit no-reliable-suggestion state when nothing safe exists.

Examples of rule families may include:

- grille -> front bumper / bumper brackets / reinforcement / lower grille,
- head gasket -> pistons / rings / main bearings / rod bearings / wrist pin,
- front shock -> top mount / spring / control arm / ball joint,
- radiator -> fan / thermostat / upper hose / lower hose.

Rules are configuration/domain logic, not hardcoded UI-only markup.

---

## 10. Mobile keyboard behavior

On Android/mobile, prevent browser/keyboard autofill/autocomplete overlays from obscuring the app's own suggestions.

Do not solve this by deleting the app suggestion feature.

Use a custom application suggestion panel anchored to the input.

For applicable search inputs use appropriate attributes such as:

- `autocomplete="off"` or a tested value that suppresses stored suggestions,
- `autocorrect="off"`,
- `autocapitalize="none"`,
- `spellcheck="false"`,
- `inputmode="search"` where suitable.

Avoid native `<datalist>` for the critical part-name suggestion flow if it produces uncontrollable keyboard/browser overlays on target Android browsers.

Test with the software keyboard open at 360/390/430 CSS px widths.

The suggestion panel must remain visible above the keyboard and must not cover the selected input or primary action.

---

## 11. Search accessibility

Vehicle picker and suggestions should implement a real accessible combobox/listbox pattern:

- keyboard arrows,
- active option,
- Enter selection,
- Escape dismissal,
- clear/reset,
- screen-reader label/status,
- touch-friendly hit areas.

Do not rely on hover for essential information.

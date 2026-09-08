# Outreach platform — editable inline

**GARBLED SPANS: none. No instruction contradicted another.**

**Three files edited, as scoped:** `lib/outreach.ts`, `app/api/admin/outreach/route.ts`,
`app/admin/outreach/page.tsx`. No migration, no schema change, nothing else. ⚠️ `git status` also shows
`ios/App/App.xcodeproj/project.pbxproj` as modified — **that is pre-existing and unrelated; I did not
touch it** (nothing here concerns iOS). **Nothing deployed. No platform value written to any row.**

---

## 🔴 The 'Hatches Up' literal — count, locations, and the fix

**Counted before changing anything.** The literal `'Hatches Up'` was matched/produced in **three code
locations** (plus two unrelated comments in `app/compare/CostComparison.tsx:195,205` about the
competitor's *rate*, which are prose, not platform matches):

| Location | Was | Role |
|---|---|---|
| `lib/outreach.ts:49` | `return 'Hatches Up'` | producer (platform derivation) |
| `app/admin/outreach/page.tsx:80` | `p.platform === 'Hatches Up'` | **matcher** (priority sort) |
| `app/admin/outreach/page.tsx:243` | `p.platform === 'Hatches Up'` | matcher (badge style) |

🔴 **Matched in more than one place → extracted to one shared exported constant.** `lib/outreach.ts` now
exports **`HATCHES_UP = 'Hatches Up'`**, and all three read it (the producer returns it; the page imports
it). The badge branch is gone entirely — replaced by the editor. **The literal is now defined once; grep
confirms it appears in code only at its single `export const` and in comments.**

---

## What changed, per file

### `lib/outreach.ts`
- **`export const HATCHES_UP = 'Hatches Up'`** — the one canonical spelling.
- **`export const PLATFORM_NONE = 'none'`** — the stored value for "checked, no online ordering".
- **`canonicalisePlatform(value)`** — trims, collapses internal whitespace, folds anything recognisably
  Hatches Up (same letters ignoring case and *all* spacing) to `HATCHES_UP`, and turns blank into `null`.
- **`isHatchesUp(platform)`** — the case-insensitive sort backstop.
- `platformFromOrderUrl` now returns `HATCHES_UP` instead of the literal.

### `app/api/admin/outreach/route.ts`
- **GET now returns `platformOptions`** — the DISTINCT non-null platform values actually present, computed
  at request time and sorted. 🔴 **Never a hardcoded list**, so it grows the moment a new platform is
  entered.
- **update_prospect canonicalises on save**: `patch.platform = canonicalisePlatform(body.platform)`
  (was `body.platform === '' ? null : body.platform`). This is the **existing** mutation path — platform
  now round-trips exactly like stage/notes, no new endpoint.

### `app/admin/outreach/page.tsx`
- The read-only platform cell is now **`<PlatformEditor>`** — a **picker with free text**:
  - suggestions = `platformOptions` (from the route) **+** fixed entries **Hatches Up**, **Own website**,
    **None — checked, no online ordering** (stores `'none'`), **(clear → unknown)** (writes `null`);
  - an **Other…** option reveals a text input for a value nothing has seen before.
- **NULL vs 'none' shown apart at a glance** by a leading glyph: **`○`** grey (NULL — "nobody has
  looked"), **`⊘`** amber (`'none'` — "checked, no online ordering"), **`●`** filled (a known platform;
  orange for Hatches Up, slate otherwise).
- The sort now uses **`isHatchesUp(p.platform)`** (case-insensitive backstop) instead of `=== 'Hatches Up'`.
- Saves go through the **existing** `patchProspect` → `update_prospect` path.

🔴 **NULL and 'none' stay distinguishable end to end:** blank/clear → `null`; the "None — checked" entry
stores the literal `'none'`; `canonicalisePlatform('none')` preserves it; the glyphs render them apart.

---

## Verification — what I exercised, and what I did NOT

**Neither tsc nor a build is verification, and neither is offered as such.**

### Exercised by execution
| | |
|---|---|
| `canonicalisePlatform` | ✅ unit-run: `Hatches up`/`hatchesup`/`HATCHES  UP`/`HatchesUp`/` hatches up ` all → `Hatches Up`; blank/`  `/null → `null`; `none` → `none`; `Deliveroo`/hosts kept verbatim; `Uber   Eats` → `Uber Eats` |
| `isHatchesUp` | ✅ unit-run: true for every Hatches Up casing/spacing; false for `none`/null/hosts |
| The literal is centralised | ✅ grep: `'Hatches Up'` in code only at its single `export const` |
| tsc | ✅ clean (supplementary, not verification) |
| 🟢 **The editor UI in a real browser** | ✅ **drove the actual page component** — see the boundary note below |

**Browser exercise (the real page, real interactions):**
- **Glance indicators render distinctly** — measured the glyph + title per row: NULL → `○` "unknown —
  nobody has looked"; `none` → `⊘` "none — checked, no online ordering"; `Hatches Up` → `●`; a custom
  host → `●`. Screenshot confirms the three read apart.
- **Picker options** on a NULL row: `["— select —","Hatches Up","pizza-mondo.co.uk",
  "order.pimp-my-fish.co.uk","Own website","None — checked, no online ordering","(clear → unknown)",
  "Other…"]` — dynamic values first, then the fixed entries.
- **Save payloads** (captured, see boundary): "None — checked" → `platform:'none'`; "(clear)" →
  `platform:null`; "Hatches Up" → `platform:'Hatches Up'`; **Other… → typing `Deliveroo` + Enter →
  `platform:'Deliveroo'`**; typing `hatches up` → `platform:'hatches up'` (raw — the route then folds it,
  per the unit test).
- No page/console errors.

### 🔴 The verification boundary — stated plainly, not blurred
- 🔴 **The browser exercise was against STUBBED network data, NOT the live tables.** I have **no admin
  session** (the page/route gate on `verifyAdmin`), so I could not load the real page as an admin. I drove
  the **real page component** in a real browser and **intercepted** its `/api/admin/outreach` calls —
  returning stubbed prospects/`platformOptions` for the GET and capturing the POST bodies **without
  letting them reach the server**. So the interactions and payloads are real; the data behind them is not
  the live tables.
- 🔴 **I did NOT exercise the route's save/canonicalise end-to-end against a live row.** That would need an
  admin POST **and would write a platform value, which is forbidden.** The route's `canonicalisePlatform`
  on save is verified by **reading the code + the unit test of that function**, not by a live admin write.
- 🔴 **I did NOT confirm the route's live `platformOptions` via an admin GET.** I confirmed the tables
  exist and hold **176 rows (114 NULL, 58 `Hatches Up`, 4 own-domain hosts)** via a read-only service-role
  query, and the dedupe/sort logic is unit-visible — but I did not call the gated route as an admin.
- **No platform value was written to any row.** Every captured POST was intercepted before the server.

### ⚠️ One behaviour to know about (not a bug, and matching the existing `stage` editor)
Platform feeds the priority sort, and saves are optimistic — so **changing a platform inline re-sorts the
list and the row can jump**, exactly as editing `stage` already does. It surfaced in testing as index-based
clicks landing on the wrong row after a re-sort (a test artifact; re-tested by name, all correct). If you
would rather the row hold its place until reload, that is a deliberate change to the optimistic-sort
behaviour for both platform and stage — say so and I will make it.

---

## To confirm it live (your step)
Open `/admin/outreach` as an admin, edit a platform via the picker (pick a fixed entry, type an Other…
value, and try a lowercase `hatches up`), and confirm it saves and — for the lowercase case — stores as
`Hatches Up`. That is the one path I could not run: it needs an admin session and writes a value.

**Nothing deployed. No platform value written. Only the three permitted files changed.**

# `MATCH_FROM` re-check — the counts did not move, and they could not have

**Date:** 9 September 2026 · **Mode:** READ-ONLY. **No database row inserted, updated or deleted. No file changed.** Nothing staged, committed or pushed; `git add` not run. Every database call was a `select` or a `head:true` count; the Sheet was read with the `spreadsheets.readonly` scope.

**Headline:** 🔴 **64 truck and 59 venue disagreements — identical to the first measurement.** That is not a null result reported as a finding; it is the *predicted* result, because 🔎 **the DB set builder does not filter on `excluded` at all.**

---

## 0. Row counts and working tree — START and END

| | START 21:44:10Z | END 21:46:13Z |
|---|---|---|
| `discovery_trucks` | 231 | 231 |
| **`discovery_trucks` `excluded=true`** | **110** | **110** |
| `discovery_trucks` `excluded=false` | 121 | — |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_exclusion_terms` | 143 | 143 |

**`git status --short`** identical at START and END — 3 modified (`DEBUG_SCRAPED_TEXT.txt`, `app/providers.tsx`, `scripts/run-scraper.js`, all pre-existing) and 8 untracked docs. `HEAD` = `origin/main` = `9e83a5e`. Nothing staged. **This report is the only thing added.**

---

## 1. 🔴 Step 1 — the matcher does NOT skip excluded trucks

🔎 The DB set builder, read from the file rather than remembered — `scripts/run-scraper.js:705`:

```js
supabase.from('discovery_trucks').select('name, aliases').limit(10000),
```

**There is no `.eq('excluded', false)`, no `.not(...)`, no filter of any kind.** It selects every row. `excluded` is not even in the `select` list, so the builder cannot see it.

🔴 **Therefore setting 55 rows `excluded = true` changes nothing about matching, and the counts were always going to be unchanged.** Stating that plainly, as asked, rather than dressing an unchanged number as a discovery.

⚠️ **And `excluded` does not mean "invisible to the scraper" anywhere.** 🔎 Manual V1.4 §7.2 records it as a gate on the **public API** (`app/api/discovery/events/route.ts:146, 254, 339`) — it decides whether a truck reaches the map, not whether the scraper matches against it. The 55 rows are now hidden from the public map. They are still in the matching set.

### The premise, verified rather than trusted

🧪 Queried the exact instant:

| | |
|---|---|
| rows with `created_at = 2026-09-03T21:52:24.672542+00:00` | **55** |
| of those, `excluded=true` / `show_on_vf=false` / `show_on_hg=false` | **55 / 55 / 55** |
| of those, with a URL (`schedule_url` or `website`) | **0** |
| distinct `created_at` values in the cohort | **1** — a single instant, as described |
| `Eat Is Greek` in the cohort | ✅ **yes** |
| `The Shack Street Food` in the cohort | ✅ **yes** |

🔴 **And the decisive one — they are still in the set the matcher reads.** Running the builder's own query, `select('name, aliases').limit(10000)`, returns **231 rows**, and both `Eat Is Greek` and `The Shack Street Food` are **present**.

---

## 2. Step 2 — the re-run

Same method as the first measurement: `normalizeName` (10L), `isFuzzyMatch` (27L), `matchTruckIn` (12L) and `resolveVenueFrom` (50L) **extracted verbatim from `scripts/run-scraper.js`**, run over the same inputs.

🧪 **Inputs identical to the first run: 176 distinct truck names · 931 distinct venue+village cases**, from all 4,300 `discovery_events`.

| | first measurement | this re-run |
|---|---|---|
| **truck disagreements** | **64** | **64** |
| **venue disagreements** | **59** | **59** |

### 🔴 What this would look like if it were proving nothing — and how that was ruled out

**A measurement against stale data and one against changed data both produce a number, and both would have produced 64.** So the run was made to carry its own proof that it saw the change:

1. 🧪 **`excluded` was read in the same query the measurement used.** Of the **231** rows read, **110 are `excluded=true`** — against **55** at the first measurement. The change is in the data this run consumed, not merely in the database somewhere.
2. 🧪 **The cohort is visible in that read:** 55 rows at `2026-09-03T21:52:24.672542+00:00`, **all 55 `excluded=true`**.
3. 🔴 **The strongest one: 43 of the 64 truck disagreements match to a row that is NOW `excluded=true`.** The matcher demonstrably matched *to excluded rows*, in this run, on this data. A stale read could not have shown that, because at the first measurement those rows were not excluded.

```
"Eat Greek"        — sheet → Eat Greek        · db → Eat Is Greek           [excluded=true, still matched]
"DBC Grill Shack"  — sheet → DBC Grill Shack  · db → The Shack Street Food  [excluded=true, still matched]
"Optio Pizza"      — sheet → (new truck)      · db → Optio Pizza            [excluded=true, still matched]
"The Foodie Shack" — sheet → The Foodie Shack · db → The Shack Street Food  [excluded=true, still matched]
…39 more
```

**Both of the wrong-match targets named in the brief — `Eat Is Greek` and `The Shack Street Food` — are still being matched to, despite being excluded.**

---

## 3. Step 3 — which disagreements resolved, and which remain

🔴 **None resolved. All 64 remain**, because nothing in the matching path consults `excluded`.

**The interesting question is therefore the counterfactual: what if the builder DID filter `excluded = false`?** Measured, not guessed — and 🔴 **it is not the improvement it looks like:**

| | as built | if filtered |
|---|---|---|
| truck rows in the DB set | 231 | **121** |
| truck disagreements | **64** | **37** |
| venue disagreements | 59 | 59 (venues untouched) |
| **resolved by filtering** | — | **41** |
| 🔴 **newly BROKEN by filtering** | — | **14** |

**The 41 that would resolve** are the empty-row wrong-matches, exactly as hoped — `Eat Greek → Eat Is Greek`, `DBC Grill Shack → The Shack Street Food`, `Optio Pizza`, `Yellow Door Eats`, `Bad Boi Burritos`, `The Kentucky Cookout` and 35 more, all matching to name-only rows with no URL and no events.

### 🔴 But filtering would break the graduated trucks — including the one that is trading

🧪 **All three graduated shadows carry `excluded = true`:**

| shadow row | `excluded` | `hatchgrab_truck_id` | in the 55-cohort? |
|---|---|---|---|
| **Pizzeria Gusto** | **true** | `pizzeria-gusto` | **no** |
| **Real Thai Food** | **true** | `real-thai-food` | **no** |
| **Tikka Tonic** | **true** | `tikka-tonic` | **no** |

🔎 **This is the documented convention, not an accident** — manual V1.4 §7.3: *"A truck that 'graduates' to a real HatchGrab customer keeps a scraped shadow row carrying `excluded = true`"*, so the duplicate stops appearing on the public map.

🔴 **So `excluded=false` filtering would drop them from the matching set, and the counterfactual shows exactly that:**

```
"Pizzeria Gusto" — sheet → Pizzeria Gusto · db → (new truck)
"Real Thai Food" — sheet → Real Thai Food · db → (new truck)
"Tikka Tonic"    — sheet → Tikka Tonic    · db → (new truck)
```

**Under `MATCH_FROM=db` with an `excluded` filter, the scraper would stop recognising the trading truck and start creating it as a new one.** The other 11 newly-broken names — `Beats 'N' Beigels`, `Beth's Bites`, `Cambs Luxury Bakes`, `Chai Stall`, `Churros Bar`, `Kapsalon Kebab`, `R Grills`, `Scotties Hot Scotch Egg`, `Slingers`, `Suffolk Smash`, `The Little Pizza Oven` — are Sheet trucks whose DB rows are excluded for other reasons.

### The 37 that would remain, by target type

- ⚠️ **34 are `db → (new truck)`** — the Sheet knows a truck the database does not, or its DB row is excluded. Not a wrong match; a **missing** one.
- 🔴 **3 are matches to a genuinely ACTIVE row, and these are the real defects:**
  - `"Between Buns"` → **`Between Buns Royston`** — a different, active row
  - `"Pimp My FIsh"` → **`Pimp My Fish`** — a capitalisation twin, both active; **this is one truck stored twice**
  - `"Test Kitchen"` → **`Test Kitchen`** (sheet says new truck) — an active DB-only row

**Those three are data problems that no flag setting fixes.**

---

## 4. Step 4 — membership after the exclusion

| | first measurement | as built now | if `excluded` were filtered |
|---|---|---|---|
| **DB-only trucks** | 97 | **97 — unchanged** | **3** |
| Sheet-only trucks | 19 | **19 — unchanged** | 35 |
| **Sheet-only venues** | 93 | **93 — unchanged** | 93 |
| DB-only venues | 6 | **6 — unchanged** | 6 |

🔴 **Unchanged, for the same reason: membership is computed from the same unfiltered query.** ⚠️ **The venue figures could not have moved at all** — the exclusion touched `discovery_trucks` only, and `venues` has no `excluded` column. Reporting them as "unchanged" is arithmetic, not evidence.

**If filtering were applied, DB-only trucks would fall 97 → 3** — the 55-cohort plus the other excluded rows leaving the set. But Sheet-only would rise 19 → 35, which is the same 14 newly-broken names plus the graduated shadows: **the same information, seen from the other side.**

---

## 5. What this means for the switch

**Nothing changed, and nothing needed to — the exclusion did what it was for.** 🧪 Those 55 rows are now hidden from the public map (`show_on_vf=false`, `show_on_hg=false`, and `excluded` gates the discovery API). **That is a real improvement to what visitors see. It is simply not a matching change**, because matching and visibility read different columns.

🔴 **The `MATCH_FROM` default still must not be flipped**, and the reason is unchanged: 64 truck and 59 venue disagreements, including 93 venues the database cannot match at all — each of which would become a new venue on a green run.

⚠️ **And the obvious next step is not the obvious next step.** Adding `.eq('excluded', false)` to the builder would cut truck disagreements 64 → 37 **and break matching for Pizzeria Gusto, Real Thai Food and Tikka Tonic.** If that filter is ever added it needs an exception for graduated shadows — something closer to *"exclude the empty rows"* (`excluded = true AND hatchgrab_truck_id IS NULL AND no URL AND no events`) than to *"exclude the excluded"*. **I have proposed nothing and changed nothing; this is measurement only.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

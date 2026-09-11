# Truck-name matching — Part A diagnosis. STOPPING, and the premise does not survive.

**9 September 2026 · DIAGNOSIS ONLY.** 🔴 **NO CODE CHANGED. NO DATABASE WRITE. NO MIGRATION.
`MATCH_FROM` NOT TOUCHED.** Nothing installed. Nothing staged. The only file this task creates is this
report.

🔴 **STOPPING AS INSTRUCTED — and with a stronger reason than the hard stop anticipated: the change this
task is heading towards is ALREADY IN PLACE in every consumer. There is nothing to write.**

---

## 0. 🔴 THE PREMISE IS CONTRADICTED BY THE CODE

**Every truck-name normaliser in both codebases already calls `.toLowerCase()` as its first operation.**
Case-insensitive matching is not a change to make; it is the existing behaviour, in all five.

🧪 Re-derived over **740 future-dated events** (fetched 740 = `count=exact` header 740 ✅) and **231**
`discovery_trucks` rows, **60 distinct future `truck_name` values**:

| comparison | distinct names unmatched | rows unmatched |
|---|---|---|
| **EXACT** (case-sensitive string) | **3** — `Pimp My FIsh`, `Village Spice`, `Little Luigi` | **10** |
| outreach `norm` (trim + lowercase) | **2** — `Village Spice`, `Little Luigi` | **2** |
| discovery feed `normalize` | **2** — same | **2** |
| scraper `normalizeName` | **2** — same | **2** |

**Row breakdown under EXACT:** `Pimp My FIsh` **8**, `Village Spice` **1**, `Little Luigi` **1**.

🔴 **So the 8 `Pimp My FIsh` rows — the case-only population this task exists to rescue — ALREADY MATCH
under every consumer.** The only rows that genuinely fail are `Village Spice` (1) and `Little Luigi` (1),
**both of which the brief already places out of scope.**

⚠️ **Where the brief's "12" came from.** I re-derive **10** rows under exact matching today, not 12. A
scrape ran at 06:00 and wrote 39 new events, so a figure taken earlier can legitimately differ — but the
number I can stand behind is **10**, and **2** under the code's actual matching.

⚠️ **The hand-written alias is not "insufficient", it is unnecessary.** The row carries
`name = "Pimp My Fish"`, `aliases = ["Pimp my fish"]`. Under exact matching neither covers `"Pimp My FIsh"`
— correct. **Under normalisation the NAME alone already covers it**, so the alias adds nothing and never
needed to. **More aliases are not the fix, and neither is a case-insensitivity change; both are already
solved.**

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/discovery-run-log-migration-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

---

## 2. A1 — THE COLLISION CHECK (the precondition)

⚠️ **How it was run:** PostgREST exposes no arbitrary-SQL endpoint, so the query was computed **faithfully
client-side over the complete table** rather than executed server-side. The exact count was taken **first**,
so a truncated fetch could not silently under-report collisions: 🧪 **count header 231, fetched 231 ✅**.

```
select lower(dt.name) as normalised, count(*) as rows, array_agg(dt.name) as variants
from discovery_trucks dt group by lower(dt.name) having count(*) > 1;
```

### 🔴 RESULT: **EMPTY SET — 0 rows returned.**

**231 names grouped into 231 distinct lowercase keys.** No two `discovery_trucks` rows differ only by case,
so case-insensitive matching **cannot merge two businesses**. ✅ **The precondition passes.**

⚠️ **Distinguishing "empty" from "failed":** the same script printed a non-zero total (231) and a non-zero
distinct-key count (231) from the same data structure, so the pipeline demonstrably ran and produced an
empty *filtered* result — not an empty *input*.

⚠️ **One gap in the query as specified, flagged rather than assumed away:** it groups on `name` only, but
every matcher also keys on **aliases**. A collision between one truck's alias and another truck's name
would carry the same merge risk and this query would not see it. **I have not been asked to change the
query and have not; noting it because the precondition is narrower than the risk it is guarding.**

---

## 3. A2 — EVERY CONSUMER OF TRUCK-NAME MATCHING

⚠️ **No search was scoped by extension** — the documented method error that made the scraper manual
necessary. **How a true negative was distinguished from a failed grep:** two controls in the same run — a
pattern that must exist (`discovery_trucks` → **23 files**) and one that must not
(`zzzz_no_such_symbol_zzzz` → no output, **exit 1**). A grep error exits **2**; neither control did.

| # | consumer | normaliser | comparison | already case-insensitive? |
|---|---|---|---|---|
| 1 | **scraper** `scripts/run-scraper.js` — `matchTruckIn` (`:1483`), exclusion guard (`:1312`) | `normalizeName` (`:55`) — lowercase, `&`→`and`, strip punctuation, strip stop-words, chop trailing `s`, join | **Levenshtein ≤ 1 OR containment** (`isFuzzyMatch`, `:67`) | ✅ **yes** |
| 2 | **outreach page** `app/api/admin/outreach/route.ts` — `buildScheduleIndex` (`:37`), `scheduleFor` | `norm` (`:29`) — `trim().toLowerCase()` | exact equality on the normalised key, over name **and** each alias | ✅ **yes** |
| 3 | **discovery feed** `app/api/discovery/events/route.ts:141` | `normalize` (`:25`) — lowercase, strip non-alphanumerics | Map lookup, **only when the FK is null** | ✅ **yes** |
| 4 | **inbound-schedule bridge** `app/api/inbound-schedule/route.ts:83,136` | `normName` (`lib/venue-matcher.ts:25`) — lowercase, strip non-alphanumerics | **containment either way** | ✅ **yes** |
| 5 | **admin screenshot exclusion** `lib/venue-signature.ts:8` `normalizeVenue` | byte-mirror of the scraper's rule | Levenshtein ≤ 1 | ✅ **yes** |

**What depends on each:** (1) which events are attributed to a truck, plus the exclusion guard and venue
creation; (2) the Schedule column and its `Y (n)` state on the outreach table; (3) whether a discovery
event surfaces on the public map at all, and under which truck's profile; (4) whether a scraped event
bridges into `truck_events` and emails an operator; (5) whether a screenshot row is refused.

🔴 **No consumer matches on the FK alone.** Both name-matching consumers document *why*: the feed at `:117`
(*"~half of discovery_events have a NULL discovery_truck_id"*) and the outreach route at `:20`
(*"populated on only 81 of 737 future events, so an FK join reports 'no schedule' for trucks that visibly
have one"*). 🧪 Consistent with the data: **all 8 `Pimp My FIsh` rows have a null FK**, and both consumers
still resolve them by name.

---

## 4. A3 — WHAT ELSE FOLLOWS THE SCRAPER'S MATCHING SET

🔎 `validTrucks` (`run-scraper.js:769`) is the flag-selected set, and the manual's note is confirmed —
`:765` states plainly that **the auto-exclusion poison guard reads `validTrucks`**, so it follows whichever
source `MATCH_FROM` picks.

| behaviour | site | follows `validTrucks`? | would case-insensitivity change its decisions? |
|---|---|---|---|
| truck matching | `:1483` `matchTruckIn` | yes | 🔴 **no — already lowercased** |
| auto-exclusion poison guard | `:1312` `knownTruckKeys` | yes | 🔴 **no — builds keys with `normalizeName`** |
| venue creation | the venue queue | indirectly (an unmatched truck's events still yield venues) | 🔴 **no** |
| dedup | Events-tab comparison | separate path | 🔴 **no** |

🔴 **THE TWO SILENT FAILURES YOU ASKED ABOUT — could a truck be newly EXCLUDED, or a venue newly CREATED?**
**No, because there is no change to make.** Both the matcher and the guard already normalise with the same
function, so their decisions are already the case-insensitive ones. **A change that is already in place
cannot move anything.** ⚠️ Had the matchers genuinely been case-sensitive, loosening them **would** have
been able to newly exclude a truck (the guard matches a proposed term against `normalizeName(t.name)`) —
which is exactly why the question was worth asking, and why the answer had to come from reading the guard
rather than assuming.

---

## 5. A4 — WHERE A FIX WOULD BELONG (moot, but answered)

**No fix is warranted, so nothing should be shared or written.** Recording the answer anyway:

🔴 **Normalisation helpers ALREADY EXIST — five of them** (§3). Two are already deliberately shared:
`lib/venue-matcher.ts` `normName` is used by both `inbound-schedule` and `reresolve-event-venues`, and
`lib/venue-signature.ts` `normalizeVenue` is documented as a **byte-for-byte mirror** of the scraper's
`normalizeName`, written that way precisely so the admin screenshot path did not become a fourth rule.

⚠️ **And sharing further would be wrong here, which is the §51.7 lesson pointing the other way.** These
consumers answer *different questions*: the scraper's rule strips stop-words and forgives one typo (it
matches noisy scraped text); the outreach route's is a plain trim+lowercase (it counts events for a known
row); the feed's strips all non-alphanumerics. **Collapsing them onto one helper would silently change
which events three separate surfaces attribute to which truck.** The right posture is the current one:
separate rules, with the one genuine duplicate (`normalizeVenue`) explicitly documented as a mirror.

---

## 6. A5 — BLAST RADIUS

🔴 **Zero, by construction: the proposed comparison is the comparison already in use.** 🧪 Measured
regardless, over 740 future events and 231 trucks:

| | |
|---|---|
| matches gained (no-match → match) by applying lowercase **on top of the code's existing matching** | **0** — the code already lowercases |
| 🔴 **matches changed from truck X to a different truck Y** | **0** |
| rows still unmatched after every consumer's normaliser | **2** (`Village Spice` 1, `Little Luigi` 1) |

**Against a naive EXACT baseline** — which is what the diagnostic query behind this task appears to have
used — lowercasing gains **8 rows, all one truck** (`Pimp My FIsh` → `Pimp My Fish`), and **changes no row
from one truck to another**. 🧪 The pairs, not just the count: the single pair is
`"Pimp My FIsh" → "Pimp My Fish"`, and there is no second pair.

⚠️ **Why the second number is genuinely zero and not merely unmeasured:** A1 established that the 231
names collapse to 231 distinct lowercase keys, so no normalised key can resolve to two different trucks.
**The `Eat Greek → Eat Is Greek` failure mode §17.5 records comes from the scraper's *containment and
Levenshtein* rules, not from case** — that risk is real and pre-existing, and nothing here touches it.

---

## 7. A6 — DOES ANYTHING DEPEND ON CASE-SENSITIVE MATCHING?

🔴 **No.** 🧪 Every one of the five normalisers lowercases before comparing, so no truck-name comparison in
either codebase is case-sensitive; a deliberate distinction between two similarly-cased trucks is not
expressible today and none exists (A1: zero collisions). A sweep for un-normalised name equality returned
only unrelated hits — menu-item names, form fields, pathnames — and none compares a truck name.
**Explicitly addressed rather than left open.**

---

## 8. PIZZERIA GUSTO

✅ **Nothing here could affect them, and nothing was changed regardless.** 🧪 `Pizzeria Gusto` is not among
the unmatched names under any comparison; its discovery row matches its own name exactly. **No customer-
facing surface and no event routing is touched by a report.**

---

## 9. RECOMMENDATION — AND WHY I AM STOPPING RATHER THAN PROCEEDING

🔴 **Do not proceed to Part B as scoped. The defect it targets does not exist in the code.** Building
"case-insensitive matching" would be adding a `.toLowerCase()` beside five that are already there, and the
report would truthfully say "0 rows changed" — a green result proving nothing, which is the failure mode
this brief warns about.

**What is actually true, and what I would suggest instead — no code written, your call:**

1. 🧪 **Only 2 future rows are genuinely unattributed**: `Village Spice` (1) and `Little Luigi` (1). Both
   are the data questions you already scoped out. **That is the whole remaining problem.**
2. ⚠️ **The stored value `"Pimp My FIsh"` is still a typo in the data**, even though every matcher forgives
   it. It will keep re-appearing while the source spells it that way — that is a scraper-source question,
   not a matching one.
3. ⚠️ **The alias `"Pimp my fish"` can be removed** — it is dead weight the normaliser already covers.
   A data change, not a code one, and I have made no write.
4. 🔴 **The diagnostic that produced the original 12 should be re-run with the code's own normaliser.**
   An exact-match query over normalised consumers will keep reporting phantom breakage.

---

## 10. EVIDENCE CLASS

- ✅ **Executed against live data:** A1 (231/231, zero collisions), §0's four-way comparison over 740
  count-asserted future events, the row breakdowns, the null-FK count, the alias contents. **All
  re-derived today; none carried from an earlier report.**
- ✅ **Structural, read from source:** all five normalisers quoted from their definitions, `matchTruckIn`,
  the exclusion guard's `knownTruckKeys`, the feed's FK-fallback line, and the two comments explaining why
  neither consumer relies on the FK.
- 🔴 **NOT verified:** nothing was run, changed or written. `tsc` was not run because **no file changed**.
- ⚠️ **A1 was computed client-side**, not executed as server-side SQL — PostgREST offers no arbitrary-SQL
  endpoint. The computation is faithful to the query and the input was count-asserted complete.

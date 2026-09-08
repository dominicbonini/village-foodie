# Pimp My Fish — nine events by hand

**7 September 2026 · SQL prepared for you to run · I ran none of it**

**Marking.** 🔎 source-read · 🧪 executed. 🔴 **Every call I made was a `select` or a read-only `postcodes.io` lookup. I wrote nothing.** The files below are yours to run.

---

## 🔴 HEADLINE: PART A IS EMPTY — NO VENUE NEEDS CREATING

🧪 All nine venues **already exist** in `venues`, all nine carry coordinates, and all nine agree with their true postcode. **Part A inserts zero rows.** Only the nine events need inserting.

| | |
|---|---|
| Venue rows to create (Part A) | **0** |
| Event rows to insert (Part B) | **9** |
| Rows updated or deleted | **0** |
| Events held back | **0** |

---

# TASK 1 — MATCHED AGAINST WHAT EXISTS

## 1a. No event already exists

🧪 Checked each of the nine on the unique key `(event_date, truck_name, venue_name)` against **both** spellings in use. **Zero rows exist for any of the nine dates** — Pimp My Fish has no row at all on 8–12 September.

🔴 **Which `truck_name` to use, and why it matters.** Two spellings exist: **`Pimp My FIsh`** (capital I, **174 rows**) and `Pimp My Fish` (3 rows). The SQL uses **`Pimp My FIsh`**, because that is the string the scraper itself writes from the Trucks tab. If I used the tidier spelling, the natural key would not collide when the scraper recovers, and you would get **duplicate events**. The map is unaffected either way — the discovery feed normalises case when it falls back to matching by name.

## 1b. Venue matching, through the fixed matcher

🧪 Each run through `findVenue` — not a raw name search — with the distance to the true postcode as an independent check:

| Event venue | → Matched venue row | Conf. | Distance to its postcode |
|---|---|---|---|
| Mandeville Hall [Burwell] | **Mandeville Hall** [Burwell] | high | ✅ 0.10 km |
| Great Shelford Memorial Hall | **Great Shelford Memorial Hall** [Great Shelford] | high | ✅ 0.06 km |
| Great Abington Post Office | **Great Abington Post Office** [Great Abington] | high | ✅ 0.09 km |
| Great Bradley village hall | **Great Bradley Village Hall** [Great Bradley] | high | ✅ 0.03 km |
| Affleck Arms [Dalham] | **Affleck Arms** [Dalham] | high | ⚠️ **2.91 km** |
| FoodPark CB1 [Cambridge] | **FoodPark CB1** [Cambridge] | high | ✅ 0.11 km |
| Fordham British Legion | **Fordham Royal British Legion** [Fordham] | high | ✅ 0.10 km |
| King Bill IV Pub [Histon] | **King Bill IV Pub, Histon** [Histon] | 🔶 **low** | ✅ 0.04 km |
| Wylde Skye [Linton] | **Wylde Skye** [Linton] | high | ✅ 0.06 km |

**Two of these deserve saying out loud.**

🔶 **King Bill IV Pub returned `low`, and it is still correct.** 🧪 Two Histon venues survive token containment — `King Bill IV Pub, Histon` and `The King Bill` — neither is an exact normalised-name match, so the matcher best-picks and labels it `low` by design. The independent check settles it: the chosen row is **40 metres** from CB24 9EP; the rejected one is 810 m. **I am proceeding on the distance, not on the confidence label**, and saying so rather than quietly treating `low` as fine.

🎯 **Wylde Skye is the case that would have gone wrong before this week.** 🧪 Linton holds **three** look-alike rows:

| Row | Distance to CB21 4XN |
|---|---|
| ✅ **`Wylde Skye`** — the one chosen | **0.06 km** |
| ❌ `Wylde Sky Brewery` | 6.82 km |
| ❌ `Wylde Sky Taproom` | 9.65 km |

The two rejected rows are both on the known-bad list from the linking work. **The fixed matcher picked the good one.**

## 1c. Known-bad geocodes — none is being linked

🧪 Every one of the nine matched venues checked against the placeholder-decimal rule and the sentinel set: **zero hits**. None is among the 40 known-bad rows.

⚠️ **One to flag but not hold back: `Affleck Arms` sits 2.91 km from CB8 8TG.** That is inside the 5 km ceiling, so it passes, but it is an order of magnitude worse than the other eight. The event will pin ~3 km from the pub. **I am not holding it back** — 3 km still puts a customer in the right village, and holding it would lose a real event — but the venue row is worth correcting separately. Its stored point is `52.2032, 0.5408`; the postcode says `52.226066, 0.520149`. **I have not changed it.**

---

# TASK 2 — GEOCODED FROM THE POSTCODES

🧪 All nine postcodes resolved through **postcodes.io**, not Gemini, and every one put through the geo-validate gauntlet:

| Postcode | Coordinate | Parish / district | Gauntlet |
|---|---|---|---|
| CB25 0AR | 52.268538, 0.327425 | Burwell / East Cambridgeshire | ✅ PASS |
| CB22 5LZ | 52.146609, 0.135006 | Great Shelford / South Cambridgeshire | ✅ PASS |
| CB21 6AB | 52.116883, 0.239119 | Great Abington / South Cambridgeshire | ✅ PASS |
| CB8 9LH | 52.151539, 0.437361 | Great Bradley / West Suffolk | ✅ PASS |
| CB8 8TG | 52.226066, 0.520149 | Dalham / West Suffolk | ✅ PASS |
| CB1 2GB | 52.193741, 0.136283 | Cambridge | ✅ PASS |
| CB7 5NJ | 52.311041, 0.391946 | Fordham / East Cambridgeshire | ✅ PASS |
| CB24 9EP | 52.255058, 0.103683 | Histon / South Cambridgeshire | ✅ PASS |
| CB21 4XN | 52.093455, 0.272619 | Linton / South Cambridgeshire | ✅ PASS |

🎯 **9 of 9 pass. Nothing is held back.** Every parish matches the village we were given — an independent confirmation that the addresses are right.

⚠️ **These coordinates are used only as the check, not as stored data.** Because every venue already exists with a good coordinate, the events link by `venue_id` and inherit it. **Nothing writes a coordinate.** The postcodes did their job by proving the nine matched venues are the right ones.

---

# TASK 3 — THE SQL

📁 **`docs/sql/pmf-events-20260907/`** — visible in Cursor (not gitignored):

| File | Rows |
|---|---|
| `00-verify-before.sql` | reads only |
| `01-chunk-1.sql` | **3 inserts** |
| `02-chunk-2.sql` | **3 inserts** |
| `03-chunk-3.sql` | **3 inserts** |
| `04-verify-after.sql` | reads only |
| `05-rollback.sql` | look, then delete exactly 9 |

## Part A — venue rows

**None.** All nine venues exist. There is no Part A file, deliberately: an empty migration file invites someone to wonder what it should have contained.

## Part B — the nine events

🧪 Verified mechanically over the three chunk files: **3 `INSERT` statements · 9 `VALUES` rows · 14 columns each · 9 distinct `venue_id`s · 3 `ON CONFLICT … DO NOTHING` guards · 0 `UPDATE` statements anywhere · 0 `DELETE` outside the rollback file.**

🔴 **Nothing updates and nothing deletes.** Every statement is an `INSERT` guarded by `ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING`, so a re-run is a no-op and can never duplicate or overwrite.

### The row I copied from

🔎 `id 862282e7-dd65-4ddf-9c15-6bf520116051` — *Pimp My FIsh @ Off The Beaten Truck, Alconbury Weald, 4 September*, the most recently created PMF row. Mirrored from it: `visibility 'public'`, `show_on_vf true`, `show_on_hg true`, `event_notes NULL`, the address in **`ai_notes`** (not `event_notes` — that is where the pipeline puts it), and `discovery_truck_id NULL`.

⚠️ **Two deliberate departures, flagged rather than slipped in:**

1. 🔴 **`source`.** You asked me to match the existing rows exactly. The existing string is `'URL: https://order.pimp-my-fish.co.uk/basket/new | Strategy: scroll_lazy'` — **a claim that the scraper read the site, which would be false.** It would also corrupt the sweep query from the last report, which parses `source LIKE 'URL:%'` to derive each truck's URL and strategy and its "last written" date; these nine would make the scraper look healthy. I have used **`'Manual entry 2026-09-07: order.pimp-my-fish.co.uk'`** instead. **If you would rather mirror exactly, change that one string in the three chunk files — the rollback keys on the natural key as well, so it still works either way.**
2. **`venue_id` is set.** The pipeline writes `NULL` here (Pass A never links). You asked for resolved links, and without them the events would list but not pin — which is the whole point. This is an improvement on the pipeline, not a mirror of it.

### ⚠️ The 11 September pair — nothing rejects it

🎯 **Checked, as asked. Nothing in the pipeline would dedup or reject the two 17:00 events twenty miles apart:**

- 🔎 The unique key is `(event_date, truck_name, venue_name)`; the venue names differ (`Fordham British Legion` vs `King Bill IV Pub`), so **no conflict**.
- 🔎 The scraper's own dedup needs date **AND** fuzzy truck **AND** fuzzy venue to all match — the venues are not within one edit.
- 🔎 The discovery feed dedups operator-vs-discovery on `truck-date-venue`; different venues, no collision.
- 🔎 `lib/event-conflicts.ts` **would** flag them as a time overlap — but it applies only to operator `truck_events` on the approval screen, never to `discovery_events`. **It will not fire.**

Both will appear on the map.

## Rollback

`05-rollback.sql` is two statements: a `SELECT` to look at exactly what would go (expect 9 rows), then a `DELETE` keyed on **truck name + the manual source string + the nine explicit (date, venue) pairs**. 🎯 Because it also keys on the source string, **a genuinely scraped row that later arrives for the same event is not caught by it.**

---

# TASK 4 — BEFORE AND AFTER

**Before** (`00-verify-before.sql`) — 🧪 measured now:

| future_events | with_venue_id | pinnable |
|---|---|---|
| **0** | **0** | **0** |

**After** (`04-verify-after.sql`) — expect:

| future_events | with_venue_id | pinnable |
|---|---|---|
| **9** | **9** | **9** |

Each chunk also ends with its own count: expect **3 → 6 → 9**. And note the `discovery_events` total before and after — 🎯 **the delta must be exactly 9.** More than 9 means something else wrote while you were working.

The second query in `04` lists the nine as the public feed will read them, with the linked venue name and coordinates, so you can eyeball that each pins where you expect.

---

# TASK 5 — STILL OPEN

🔴 **The cause is unknown, and this is a stopgap.** It fixes one truck's data for five days. It fixes nothing about why the truck stopped.

What is ruled out, each by execution rather than argument: the URL, the path, the strategy, the page rendering, and the extraction — 🧪 the scraper's own prompt against that page produced all nine events today. And 🧪 **Pizza Mondo runs on the same host with the same `order.<domain>/basket/new` shape and wrote on 6 September**, which argues against host-level blocking. **The Sheet row and the GitHub Actions log are the two things that would settle it, and I can read neither.**

## The real problem, restated

🧪 Measured across all 4,231 discovery events:

| | |
|---|---|
| Trucks with any events | **175** |
| Trucks with a **future** event | **44** |
| 🔴 **URL-scraped trucks with ZERO future events** | **52** |

**This SQL fixes 1 of those 52.** The others include *Naked Fish* (68 events, last written 6 Sept), *Churro Boyz* (65), *Wok Wraps* (58), *Between Buns* (79) and *Tacoman*. Some are genuinely idle; most are probably not, and **nothing in the system can tell you which** — because the discovery pass writes no run log, so "scraped and found nothing" is indistinguishable from "never scraped".

🎯 **The recommendation from the last report stands and has not been built: one `scraper_run_log`-shaped row per site per discovery run.** Until that exists, every one of these 52 is invisible, and the only reason you know about Pimp My Fish is that you happened to look.

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No table was written by me; every database call was a `select`.** The only files created are the six SQL files under `docs/sql/pmf-events-20260907/` and this report. Tree: **26 modified / 86 untracked**, otherwise unchanged.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **That the nine events are still accurate.** They are copied from your message, and 🧪 I independently read the same nine from the truck's own site today — but a truck can cancel. **The times are the trading window; Hatches Up shows ordering windows up to 15 minutes earlier.**
- 🔴 **Why the scraper stopped.** Unchanged from the last report: the Sheet row and the Actions log are both unreadable from here.
- ⚠️ **`Affleck Arms` will pin ~2.9 km from the pub**, because the existing venue row is that far from CB8 8TG. Inside the ceiling, so not held back, but the row wants correcting.
- ⚠️ **`King Bill IV Pub` links on a `low`-confidence match.** I accepted it on a 40 m postcode distance rather than on the label. If the matcher is ever right to be unsure here, this is where it would show.
- ⚠️ **Whether `Fordham Royal British Legion` and `Great Bradley Village Hall` are the same places as the site's `Fordham British Legion` and `Great Bradley village hall`.** Name variants, 0.10 km and 0.03 km from the stated postcodes — near-certain, not certain.
- ⚠️ **I did not verify the SQL by running it**, which is the point of this task. The counts are predictions from measured state.
- ⚠️ **The `Pimp My FIsh` / `Pimp My Fish` split** is left as it is. Normalising it is a separate decision with its own dedup consequences.

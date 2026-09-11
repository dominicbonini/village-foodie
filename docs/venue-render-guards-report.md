# The three rendering guards — built

**The prompts were not touched.** 🧪 `git diff scripts/run-scraper.js` is empty, both
`VILLAGE (MANDATORY)` labels are still in place, and `buildHgPrompt` is untouched. No schema change, no
migration, no database write, no scrape, nothing installed. `truck_events` was neither read nor written.
The matcher, the dedup gate's rules, the URL guards, the outreach console, templates, the events tab and
the schedule popup were not touched.

**Re-derived live, snapshot 2026-09-11T19:31:52Z:** `discovery_events` **933** · future **703** · rows
with a null village **28** · `venues` **819** · **99 published events** (truck resolved, not excluded,
`show_on_vf`).

---

# 🔴 THE GROUPING CHANGE, FIRST — IT IS THE SHARPEST THING HERE

| | |
|---|---|
| venue groups **today** | **54** |
| venue groups **after** | **53** |
| events whose public page changes | **16 of 99** |
| 🔴 venues that **gain** a second page | **0** |
| 🔴 venues that **lose** a second page (a merge) | **1** |

**The one merge, named:** `the-fox-inn-honington` ← `the-fox-inn-honington` + `the-fox-inn-bury-saint-edmunds`.
One venue, two pages today because its events disagree about the village; one page after.

**There are no splits.** No venue that has one page today gains a second.

## Every event that moves page — all 16

| n | event text [its village] | the venue row it is linked to | page today → page after |
|---|---|---|---|
| 2 | `Essex Foodies Market` [—] | `@Essexfoodiesmarket` [Leigh On Sea] | `essex-foodies-market-leigh-on-sea` → `essexfoodiesmarket-leigh-on-sea` |
| 1 | `Debenham` [Debenham] | `Debenham Vets` [Debenham] | `debenham` → `debenham-vets` |
| 1 | `Off The Beaten Truck - The Common` [Saffron Walden] | `The Common` [Saffron Walden] | `off-the-beaten-truck-the-common-saffron-walden` → `the-common-saffron-walden` |
| 1 | `Cavendish Five Bells` [Sudbury] | `The Five Bells` [Cavendish] | `cavendish-five-bells-sudbury` → `the-five-bells-cavendish` |
| 1 | `Foodpark, Eddington` [Cambridge] | `FoodPark at Eddington` [Cambridge] | `foodpark-eddington-cambridge` → `foodpark-at-eddington-cambridge` |
| 1 | `Food Park-Cambridge Science Park` [Cambridge] | `Cambridge Science Park` [Cambridge] | `food-park-cambridge-science-park` → `cambridge-science-park` |
| 1 | `Bailey Hills Estate` [Bishop's Stortford] | `Bailey Hills Estate` [Bailey Hills] | `bailey-hills-estate-bishops-stortford` → `bailey-hills-estate` |
| 1 | `The Fox Inn` [Bury Saint Edmunds] | `The Fox Inn` [Honington] | `the-fox-inn-bury-saint-edmunds` → `the-fox-inn-honington` |
| 1 | `Old Goat Brewery` [—] | `Old Brewery` [Stansfield] | `old-goat-brewery-stansfield` → `old-brewery-stansfield` |
| 1 | `Wine-boutique, Felixstowe` [Felixstowe] | `Wine-Boutique` [**Sudbury**] | `wine-boutique-felixstowe` → `wine-boutique-sudbury` |
| 1 | `The Red Lion` [Blewbury] | `The Red Lion` [**Great Sampford**] | `the-red-lion-blewbury` → `the-red-lion-great-sampford` |
| 1 | `The Cross Keys` [Henley] | `The Cross Keys` [**Hatfield Peverel**] | `the-cross-keys-henley` → `the-cross-keys-hatfield-peverel` |
| 1 | `Sudbury Street Food Festival` [Sudbury] | `The Street` [**Whatfield**] | `sudbury-street-food-festival` → `the-street-whatfield` |
| 1 | `Fest Lion` [Sawston] | `The Lion` [**Ickleton**] | `fest-lion-sawston` → `the-lion-ickleton` |
| 1 | `Northstowe` [Cambridge] | `Northstowe Half Marathon` [Northstowe] | `northstowe-cambridge` → `northstowe-half-marathon` |

**15 page URLs stop being produced and 14 new ones start.** A bookmark or an indexed link to one of the
15 will render an empty venue page, because `VenueClient` filters on the key and finds nothing.

## ⚠️ THE HALF OF THIS YOU SHOULD LOOK AT BEFORE DEPLOYING

**The bottom six rows of that table inherit a venue match that looks wrong.** `The Red Lion` [Blewbury]
is linked to a venue in Great Sampford; `The Cross Keys` [Henley] to one in Hatfield Peverel;
`Sudbury Street Food Festival` [Sudbury] to `The Street` [Whatfield]. Today the page is named after the
event's own text, so a wrong `venue_id` is invisible on the public site. **After this change the event
moves onto the wrong venue's page** and its schedule appears under a pub in another town.

🔴 **This is not a defect in the grouping rule — it is the grouping rule making an existing bad match
visible.** It is the same class the tie-break work and R5 exist for, and it is the direct cost of your
decision to key on `venue_id`: the key is only as good as the link. I am flagging it rather than
softening the rule, because the rule is what you asked for and the alternative you rejected (name alone)
would merge `The Bull` [Bottisham] with `The Bull` [Burrough Green].

## ⚠️ TWO VENUE ROWS COLLIDE ON ONE KEY

🧪 Two pairs of **different** `venue_id`s produce the same slug, so they group as one page:

```
"off-the-beaten-truck-wintringham-st-neots"  ← "Off The Beaten Truck, Wintringham" [St Neots]
                                              + "Off The Beaten Truck - Wintringham" [St Neots]
"off-the-beaten-truck-northstowe"            ← "Off The Beaten Truck" [Northstowe]
                                              + "Off The Beaten Truck - Northstowe" [Northstowe]
```

Both pairs are comma-versus-hyphen duplicates of one real place, so merging them is almost certainly
right — but it **is** a merge of two `venue_id`s, which is not strictly what "group on `venue_id`" says,
so it is recorded rather than assumed harmless. Neither pair contributes to the 16 moves above.

---

# WHAT WAS BUILT

| file | change |
|---|---|
| `lib/utils.ts` | **new `venueGroupKey`** — one definition of the key, beside `getVenueSlug` |
| `app/api/discovery/events/route.ts` | publishes `venueSlug`, derived from the **linked venue row**; `id` added to the venues join |
| `types.ts` | `venueSlug?: string` on `VillageEvent` |
| `hooks/useVillageData.ts` | groups on `venueGroupKey` |
| `components/EventListCard.tsx` | links to `venueGroupKey` |
| `app/venues/[slug]/VenueClient.tsx` | filters on `venueGroupKey`; **share text** and **header** guarded |

**One helper, not a fourth copy.** The three surfaces previously each wrote
`getVenueSlug(name, village)` and agreed only by coincidence; they now call one function.

🔴 **A silent failure caught while building, worth recording.** The first version tested
`venue.id ? … : …` — but the feed's `venues!venue_id (…)` join **did not select `id`**, so the guard
would have been false for every row and the whole grouping change would have been a no-op that
type-checked, linted and looked correct. 🧪 `id` was added to the select and the join proved to return it
before anything else was measured.

---

# THE RENDER PROOF — four village states, each surface

Every case below was rendered through `react-dom/server` with the repo's **real** `getVenueSlug` and
`venueGroupKey` compiled from source. The feed's own rule (`e.village || venue.village || ''`) supplies
the village, so "null + linked" is the state where the venue fills the gap.

## 🔴 The instrument was checked before its output was trusted

The same harness was run against the **committed, pre-fix** expressions. It reported **3 failures and
exited 1**; against the shipped code it reports **0 failures and exits 0**.

```
BEFORE:  "…for The Affleck Arms in ! 🍔🍻"                    🔴 dangling preposition
BEFORE:  <a><span>📍</span><span> </span></a>                  🔴 empty label
BEFORE:  linked rows with different village text group together? 🔴 they split
         FAILURES: 3   exit 1
AFTER:   FAILURES: 0   exit 0
```

## 1 · Share text

```
village present        → "…for The Affleck Arms in Dalham! 🍔🍻"              ✅
null + venue LINKED    → "…for The Affleck Arms in Dalham! 🍔🍻"              ✅
null + venue UNLINKED  → "…for The Affleck Arms! 🍔🍻"                        ✅ clause dropped
wrong village          → "…for The Affleck Arms in Recreation Ground! 🍔🍻"   ✅
```

## 2 · Header 📍 line — three outcomes, both empty states covered

```
village + postcode     → <a><span>📍</span><span>Dalham • CB8 8TG</span></a>  ✅
village, no postcode   → <a><span>📍</span><span>Dalham</span></a>            ✅
no village, postcode   → <a><span>📍</span><span>CB8 8TG</span></a>           ✅ postcode alone
no village, no postcode→ (link not rendered)                                  ✅ nothing
```

The separator now belongs to the **join**, not to the postcode, so it cannot appear with one side empty;
and the whole `<a>` is dropped when there is nothing to label it with — a 📍 linking to a map search
built from an empty string is a broken control, not a smaller one.

## 3 · Grouping key

```
village present        → /venues/the-affleck-arms-dalham
null + venue LINKED    → /venues/the-affleck-arms-dalham    ← the fix: same page
null + venue UNLINKED  → /venues/the-affleck-arms           ← unchanged from today
wrong village          → /venues/the-affleck-arms-dalham    ← the venue wins over the event's text

linked rows with DIFFERENT village text group together? ✅  (the-affleck-arms-dalham / the-affleck-arms-dalham)
two DIFFERENT venues sharing a name stay apart?         ✅  (the-bull-burrough-green / the-bull-lower-green)
unlinked events unchanged?                              ✅  (the-affleck-arms-dalham)
```

**`The Bull` [Bottisham] and `The Bull` [Burrough Green] stay on separate pages**, which is the property
the tie-break work established and the reason name-alone grouping was rejected.

**Checks:** `npx tsc --noEmit` exits 0. Lint across the six changed files: **42 problems before, 42
after** — one new unused-import warning appeared and was removed rather than left.

---

# 4 · THE ASSERTION I DID NOT BUILD

**The gap:** a scrape whose prompts begin declining villages writes `village: null` through the gate,
which is a valid row. The run exits 0. Nothing anywhere compares village coverage between runs, so the
data changes quietly and the only signal is a query someone remembers to run.

**Where it would live.** `scripts/geo-validate.js`, beside `assertInboundOk` and
`assertNoWriteFailures` — the two existing end-of-run assertions the scraper already fails on. It has to
be an assertion in that file rather than a dashboard, because the point is to turn a quiet data change
into a red run, and that file is the only thing whose exit code the workflow reads.

**What it would compare.** Not an absolute floor — a truck with five genuinely unknown venues would trip
that forever. It should compare **this run against the recent past, for the rows this run wrote**:

- numerator: rows written this run with a null or empty village;
- denominator: rows written this run;
- baseline: the same ratio over the last 14 days, from `discovery_events.created_at`.

**The threshold.** Ordinary variation is large when a run writes few rows, so a fixed percentage fires on
noise. Two conditions, both required:

1. the run wrote at least **30** rows — below that the ratio is not a measurement;
2. this run's null-village ratio exceeds **the 14-day baseline + 20 percentage points**.

🧪 Today's baseline for calibration: **28 of 933 rows (3.0%)** carry a null village. A run at 23% or more
would fire. The intended effect of the prompt change is a rise of a few points, not twenty.

**And the mirror assertion, which matters more:** the count of rows where `village` equals `venue_name`
should only ever fall. 🧪 It is **62** today. If a run writes a new one, that is the invented-village
behaviour returning, and it should fail the run immediately with no threshold at all — one is too many.

Both are cheap, both are checkable from SQL first (the two queries are in the chat), and neither is worth
building until the prompt change has actually shipped and produced a run to calibrate against.

---

# HOW I CHECKED

The grouping counts were produced by replaying the feed's own gates and mapping over a frozen snapshot of
all 933 events, 819 venues and 231 trucks, then applying the **shipped** `venueGroupKey` and the
committed `getVenueSlug` and diffing group membership per event — so the 54 → 53 and the 16 moves are
what the deployed code will do, not an estimate. Every render came from executing the surfaces' exact
expressions through `react-dom/server` in four village states, and the harness was validated against the
pre-fix expressions first: it exits 1 on the old code and 0 on the new. Searches were run without an
extension filter, and no single-line grep was trusted for a sentence that wraps.

**Not done:** no prompt edited, no scrape, no schema change, no migration, no database write, no
assertion added.

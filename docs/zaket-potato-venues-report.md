# Zaket Potato: why most of its events have no venue

**Date:** 15 October 2026. **Status:** look-only diagnosis. Nothing was changed: no stored data, no code, no SQL run. Every database read was a `select`, and the gate was replayed with `dryRun: true`, which creates nothing and writes nothing (`lib/discovery-gate.ts:313`).
**SQL:** none to run. The fixes below need your decision first (§5).

---

## 1 · What the data shows

Zaket Potato (`discovery_trucks` `d14d51ff…`) has **58 live upcoming events. 47 have no venue, and 11 do.**

| Group | Rows | Venue name [village] | Venue | Created | Source |
|---|---:|---|---|---|---|
| A | **47** | "The Railway Tavern" [*empty*] | **none** | **16 Sep 2026, 11:01, one run** | Facebook page, `scroll_lazy` |
| B | 3 | "Zaket Potato" [Norwich] | Zaket Potato, Norwich NR2 3AA | 9–10 Oct | Facebook page |
| C | 8 | "The Fox inn" [Honington] | The Fox Inn, Honington | 22 May (import) | Drive screenshot |

**Group A, the 47:**
- One row for **every day from 15 October to 30 November**, with a fixed weekly time pattern: Mon 17:00–20:00; Tue–Thu 12:00–14:30; Fri–Sun 12:00–20:00.
- Every row has the AI note "10 Dereham Road, Norwich" and an empty village.
- Earlier rows from the same batch have passed and were removed by the nightly pruner, as designed.

**Groups B and A overlap.** On 15, 16 and 17 October Zaket has **two rows each**, one "Railway Tavern" (no venue) and one "Zaket Potato" (linked). Same day, same times, same address note. These are duplicates that nothing marked.

---

## 2 · What happened

### 2.1 One scrape invented 11 weeks of events
`discovery_run_log` for Zaket Potato, every run from 15 September to 14 October:

- **16 Sep: page 897 characters → 109 events extracted, 72 new.**
- Every other day: page 796–1,085 characters → **1 to 14 events**, mostly duplicates.

A 900-character Facebook page cannot list 109 dated events. The model turned a weekly opening-hours post ("Mon 5–8, Tue–Thu 12–2:30, Fri–Sun 12–8 at 10 Dereham Road") into a dated row for every day to the end of November.

- **Group A is that one run.** It is not a schedule the truck published day by day.
- **This breaks the events prompt's own rules.** Rule 12 says extract only where a day or date is stated beside the venue, and rule 3 says use only the *next* date for a weekday (`scripts/scraper-prompts.js:54-71`).
- **Nothing checks the output against the page.** No guard compares the number of events extracted with the size of the page, so the run logged `ok`.

The truck may well trade at that address on those days. But beyond the week the page showed, the dates are the model's extrapolation, not something Zaket published.

### 2.2 Why those 47 can never get a venue
Replaying four Group A rows through the gate (`admitDiscoveryEvents`, dry run):

```
"The Railway Tavern" [—]       → r5-rejected: The Railway Tavern [Dereham]: no anchor for village "—"
"The Railway Tavern" [Norwich] → r5-rejected: The Railway Tavern [Dereham]: 24.0 km from Norwich anchor > 15 km   (what-if)
"Zaket Potato" [Norwich]       → high: Zaket Potato (village agrees)
"The Fox inn" [Honington]      → high: The Fox Inn (village agrees)
```

1. **The model left the village empty.** "Norwich" was only in the notes. Since V2.0 (12 Sep) the prompt says to leave the village empty rather than guess (scraper manual V2.0).
2. **The only venue called "The Railway Tavern" is in Dereham (NR19 1HB), 24 km away.** The matcher offers it as a candidate. The R5 check then refuses it: with no village there is nothing to measure against, and with "Norwich" it is beyond the 15 km limit. Both refusals are correct, because linking it would put Zaket's pin in the wrong town.
3. **Because the matcher found a candidate, the gate does not create a new venue.** It creates one only when there is no candidate *and* there is a village (`lib/discovery-gate.ts:258-274`). So no rule can ever give these rows a venue.
4. **Linking happens only once.** The scraper drops repeat rows against the Sheet before posting (`scripts/run-scraper.js:1505-1510`), so a row left without a venue is never offered to the gate again. No scheduled re-linking job exists: `link-venues.yml`, proposed in `docs/event-linking-design-report.md` §7.1, was never built.

### 2.3 Why the duplicates were not caught
- **The scraper's duplicate check needs the same venue name.** It matches on date, truck and venue name (`run-scraper.js:1505-1510`). "Zaket Potato" and "The Railway Tavern" do not match.
- **The gate's duplicate rule needs a location on both rows:** postcode, coordinates, or names one inside the other within 1.5 km. A row with no venue has none of these. The dry run confirms "dup: none" for the 15 and 16 October pairs.

The model's name for the place changed on 9 October, from "The Railway Tavern" to "Zaket Potato". So the newer, correctly linked rows sit beside the old ones instead of replacing them.

---

## 3 · It is not only Zaket

**262 of 657 upcoming live GB events (40%) have no venue.** Each was replayed through the gate in a dry run:

| Reason | Rows |
|---|---:|
| Refused by R5: **no village** to anchor the candidate | 110 |
| Refused by R5: candidate too far away, or postcode area differs | 136 |
| No candidate and no village, so nothing can be created | 6 |
| **Would link today** if re-posted (never retried) | 10 |

**Trucks with the most rows:**

| Truck | Rows | Reason |
|---|---:|---|
| White Gold | 59 | 33 no village, 26 too far |
| Zaket Potato | 47 | no village |
| Hot Dog Mafia | 29 | too far |
| Perky Beans | 28 | too far |
| The Little Pizza Oven | 27 | |
| Camp Out Takeaway | 26 | |

**Many refusals are right:**
- "Near the Co op Store", "Closed" and "Conor wedding not working" are not venues.
- "The Bull Pub" [Great Paxton] → Saffron Walden, 36 km away.

**Some are fixable gaps:**
- Unique names with no village: "Roughacre Brewery" → Clare.
- Villages with no anchor: "Church View".
- The foodPark postcode-area mismatch.

**Likely second defect, not yet proven: new venues lose their coordinates.**
- 42 of the 50 venues created since 12 September have no coordinates.
- In `run-scraper.js` the gate post (`:2271+`) runs **before** the geocoding step (`:2317+`). The gate creates the venue without coordinates first. The later geocoded upsert uses `ignoreDuplicates: true` on the same key (`:2437-2444`), so it writes nothing.
- If this is right, coordinates found by postcodes.io are thrown away and the log still reports them written. A linked event still gets no pin.
- This needs checking against one run's log before anyone acts on it.

---

## 4 · Manuals and ways of working

**What the manuals say should happen.** When a match fails, the venue stays NULL rather than guessing (scraper manual §23.2; app manual §53.2; `lib/discovery-gate.ts:22-26`). The event is still listed, just without a pin (`app/api/discovery/events/route.ts`). Zaket's 47 rows behave exactly as designed. The gaps are upstream (extraction) and in the lack of any second chance.

**Already-recorded open items this matches:**
- App manual §53.8 #4: "53 events still need a venue row that does not exist — no rule reaches those". That is now 262 rows.
- Event-linking design report §6: rows whose venue is the truck's own name should be "DO NOT CREATE". This was never built; no code checks for it.
- The "Railway Tavern [Norwich] vs Dereham, 24 km" case for Zaket itself, recorded 7–11 September in the venue-linking scope, matcher-fix and dedup dry-run reports. It was refused, never resolved, and has grown from 6 rows to 47.
- The Hatches Up reconciliation (§203) left Zaket's rows "unverifiable", with the open question of whether it runs one van or two.

**Manual sections that are stale.** Per `working-rules.mdc` §1 these are flagged, not followed:
1. **Scraper manual §2.5 and §6 #3** still say "`venue_id` is never set" by Pass A. Since 11 September the scraper posts through the gate, which sets it.
2. **Scraper manual §23 and app manual §53 header** still say "NOT DEPLOYED, 0 commits". The gate is committed (`7a9b823`, 11 Sep; last change `3033a53`, 10 Oct), and the app manual's own §53.8 #10 says it is deployed.
3. **App manual §53.8 #6** says the run log has no retention rule. The scraper manual (V2.1) records that the pruner has deleted run-log rows older than 30 days since 11 September.
4. **`.cursor/rules/working-rules.mdc`** names the reference manual as "V9.1, July 2026". It is V15.8, and the scraper manual (V2.2) is a second source of truth the file does not mention.
5. **Neither manual** mentions the one-time linking, the gate-before-geocode order, or the extraction blow-up in §2.1.

**Rules that apply to a fix:**
- Diagnose first, then report, then wait for your nod. This is mandatory for the venue matcher and the scraper bridge (app manual, working rules).
- No stored-data change without your decision.
- Pizzeria Gusto is never touched (the pruner always keeps its rows).
- Localhost writes to the production database, so fixes are tested on fixtures.
- Hand-inserted or hand-edited rows keep the pipeline's exact `truck_name`, and their `source` must not claim a scrape.
- Never merge venues on coordinates alone.

---

## 5 · Options (your decision; nothing done)

**For Zaket now:**
- **a. Confirm whether "10 Dereham Road, Norwich" is the existing "Zaket Potato" venue (NR2 3AA).** If it is, the 47 rows can be pointed at it. I can write that SQL, marked "run now", once you say so.
- **b. Or decide whether the extrapolated dates should stand at all.** Only the week the page showed is evidenced. One option is to mark the November rows superseded rather than delete them.
- **c. Mark the three 15–17 October duplicates:** Railway Tavern rows superseded by the linked Zaket Potato rows.

**For the pipeline:**
1. **Add an extraction sanity guard.** Refuse or flag a run whose event count is far beyond what the page could hold (109 from 897 characters). Strengthen the prompt against turning opening hours into weeks of dates.
2. **Give rows without a venue a second chance:** a scheduled re-link pass through the gate, with a dry run first. Ten rows would link today.
3. **Use a postcode or town found in the notes as the anchor when the village is empty.** "10 Dereham Road, Norwich" would then anchor to Norwich.
4. **Build the design report's "venue is the truck's own name" rule.**
5. **Verify, then fix, the gate-before-geocode order** (42 of 50 new venues without coordinates).
6. **Correct the five stale manual sections above,** by decision.

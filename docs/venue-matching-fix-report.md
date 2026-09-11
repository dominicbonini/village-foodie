# The `pickBest` tie-break (built) and the extraction prompts (reported)

**Part A is built. Part B is analysis only — no prompt was edited, no data changed, nothing re-resolved.**
No schema change, no migration, no database write, no scrape, nothing installed. `truck_events` was
neither read nor written. The dedup gate's rules, the URL guards, the outreach console, templates, the
events tab and the schedule popup were not touched.

**Live state, re-derived from one snapshot at 2026-09-11T19:18:20Z:**

| | value | the brief said |
|---|---|---|
| `discovery_events` | **933** | 935 — it has moved by 2 |
| rows with a null `venue_id` | **321** | 322 |
| future rows | **703** | — |
| future rows still unlinked | **225** | — |
| `venues` | **819** | — |

⚠️ **One reading I had to settle rather than stop on.** Part A says *"STOP HERE. Report A1–A4 and wait"*,
and the closing instruction asks for one report covering A **and** B. I read them together: Part B is
explicitly *report, do not edit*, so completing it ships nothing and nothing reaches a scrape without you
reading it first. **No prompt was changed.** If you meant Part A to be delivered alone, the Part B
sections below are the thing to ignore, not to undo.

---

# PART A — THE `pickBest` TIE-BREAK

## A1 · What it compared, and where the tie-break sat

`pickBest` (`lib/venue-matcher.ts`) ranked candidates on three keys, in order:

| | key | |
|---|---|---|
| (a) | exact match of the normalised name against the scraped name | |
| (b) | largest significant-token overlap with the scraped name | |
| (c) | **lexicographically smallest `id`** | 🔴 **the tie-break** |

**It is reached from two places**, both of which return `confidence: 'low'`:

1. more than one candidate agrees on the village and none is an exact name match;
2. two or more candidates and **none** agrees on the village — the branch the 17 rows hit.

🔴 **When two venues carry the same name, (a) and (b) tie by construction, so the winner was decided by a
UUID.** Distance was never consulted, although the anchor needed to decide it is computed one function
away in `applyDistanceCeiling`.

## A2 · What it does now

Distance is inserted as key **(c)**, and the id drops to **(d)**:

```
(a) exact name  →  (b) token overlap  →  (c) nearest the event village's anchor  →  (d) smallest id
```

🔴 **It is a tie-break, not a re-ranking.** It sits *below* name and token overlap, so a better-named
candidate still wins and the change cannot make the matcher choose a worse-named venue than before.

**What happens when there is no distance — stated, not left implicit:**

| case | behaviour |
|---|---|
| **Neither** candidate measurable — the event's village has no anchor, or neither venue has coordinates | Both score `Infinity`, the comparison ties, and it **falls through to (d), the smallest id** — byte-for-byte the old behaviour. The fallback *is* the old rule |
| **Exactly one** measurable | The measurable one wins. A venue we can place near the event beats one we cannot place at all — and it is the only one R5 can ever accept, because `r5Accept` refuses a venue with no coordinates outright. Preferring it strictly widens what can be linked |
| Both measurable | Nearer wins |

The two call sites now pass the event's village and the venue list through; nothing else in `findVenue`
changed.

## A3 · 🔴 PROVED BOTH WAYS

The matcher was run over **all 933 events** — not the 17 — before and after, recording the chosen venue
and confidence for every row, and the two runs were diffed in full.

### The instrument was checked before its output was trusted

A diff that reports "nothing changed" proves nothing unless it can report the opposite. The same harness
was first pointed at a **deliberately broken** matcher (`pickBest` returning the *last* candidate):

```
INSTRUMENT CHECK — broken variant:  933 compared · UNAFFECTED 784 · changed 149
   44× "The Bull Pub" [Great Paxton]  → The Bull [Burrough Green]
   11× "The Railway Tavern" [Norwich] → Off The Beaten Truck - The Railway Arms [Saffron Walden]
   …
   exit 0 — the diff DOES detect a change
```

### The real result

| | rows |
|---|---|
| compared | **933** |
| 🔴 **UNAFFECTED** | **913** |
| changed venue or confidence | **20** |
| R5 accept → refuse (regressions) | **0** |

**All 17 tie-break rows change, and every one moves to the nearer venue:**

| rows | event | before | after | |
|---|---|---|---|---|
| **9** | `The Bull` [Bottisham] | `The Bull` [Lower Green] **26.9 km** → R5 refuse | `The Bull` [Burrough Green] **8.8 km** → **R5 ACCEPT** | nearer by 18.2 km |
| **8** | `The Plough` [Great Shelford] | `The Plough` [Birdbrook] **26.7 km** → R5 refuse | `The Plough` [Shepreth] **8.2 km** → **R5 ACCEPT** | nearer by 18.5 km |

Those 17 are the 9 Holy Loaded and 8 Gino's Pizza rows, all unlinked and future-dated.

**🔴 THREE FURTHER ROWS CHANGED THAT I DID NOT PREDICT, and both of the interesting ones are inert:**

| rows | event | before → after | status |
|---|---|---|---|
| 2 | `Off The Beaten Truck - Wintringham` [Wintringham] | `Off The Beaten Truck, Wintringham` [St Neots] **4.6 km** → `Off The Beaten Truck - Wintringham` [St Neots] **0.0 km** | 1 row **already linked**, 1 row **past-dated** |
| 1 | `Northstowe` [Cambridge] | `Northstowe Town` [Northstowe] **10.7 km** → `Crumble King of Northstowe` [Northstowe] **9.5 km** | **already linked** |

- The Wintringham pair is a comma-versus-hyphen duplicate; the new pick is the exactly-named one at 0.0 m.
- ⚠️ **The Northstowe row is the one change that is not obviously better on NAME.** `Northstowe Town`
  reads like the better answer to a human, but both candidates have identical token overlap with the
  scraped `"Northstowe"`, so (a) and (b) tie and distance decided — correctly by the rule, 1.2 km nearer.
  **It is already linked, so nothing re-resolves it and no stored value moves.** I am flagging it because
  it is the shape of case where a name-blind tie-break can look wrong.

**Of the 20 changed rows: 17 are unlinked and future (the ones a re-resolve would actually use), 2 are
already linked, and 1 is past-dated.**

## A4 · What it does to the 224 refusals, on its own

| | before | after |
|---|---|---|
| R5 **refuses** (unlinked, future) | **224** | **207** |
| R5 **accepts** (unlinked, future) | **0** | **17** |

🔴 **17 refusals become accepts — and no acceptance becomes a refusal.** That is the whole of Part A's
effect on the backlog: **207 rows still refuse**, because their cause is the village field, which is
Part B.

**Checks:** `npx tsc --noEmit` exits 0. `eslint lib/venue-matcher.ts` reports **0 problems before and 0
after**. One file changed: `lib/venue-matcher.ts`.

---

# PART B — THE EXTRACTION PROMPTS (REPORT ONLY, NOTHING APPLIED)

## B1 · The three prompts, quoted

All three are inline template literals in `scripts/run-scraper.js` (JavaScript — not scoped by extension
in any search here).

**① The rule / manual-schedule prompt** (assigned to `prompt`, the branch producing `Manual Entry` rows;
its JSON shape is the `{ "venue": …, "village": …, "proof": … }` example):

> `6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.`

**② The event prompt** (the other `prompt` branch, producing `URL:` rows; JSON shape
`{ "DateStart": …, "Venue Name": …, "Village": … }`):

> `6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name.`

**③ The HatchGrab-loop prompt** (`buildHgPrompt`, producing `hg_scraper` rows):

> `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town/village is EMBEDDED inside the venue name,`
> `SPLIT it out … Never leave a town buried in venue_name. **If the town truly cannot be`
> `determined, use "".**`

### How ③ differs — one sentence

①, ② and ③ all *demand* a village. **Only ③ supplies an escape:** `If the town truly cannot be
determined, use ""`. ① and ② give the model no permitted way to say "not in the text", and a mandatory
field with no null option is answered by the nearest string to hand — which is the venue name.

⚠️ **The house style for this already exists inside prompt ②**, one rule below the faulty one:

> `9. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string) for TimeStart and TimeEnd.`

Times were given permission to be absent. Villages were not.

### The A/B that already ran in production

| prompt | writer | rows | village == venue name | R5 refusals |
|---|---|---|---|---|
| ① mandatory | `Manual Entry` | 252 | **62** | **122** |
| ② mandatory | `URL:` scraper | 518 | 12 | **102** |
| ③ **has the escape** | `hg_scraper` | **86** | **0** | **0** |

## B2 · The proposed wording — NOT APPLIED

**① becomes:**

> `6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

**② becomes:**

> `6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

Three deliberate choices: `(MANDATORY)` is dropped from the label because it is the thing being reversed;
the escape is worded as ③ words it; and `do NOT repeat the venue name` is added because that is the
specific failure observed, which neither ③ nor the times rule had to name.

⚠️ **Expected effect, stated honestly: this makes the field HONEST, not CORRECT.** A model that returns
`""` produces a row with no village. It does not tell us where the event is.

## B3 · What happens to the rows already written — traced, not inferred

🔎 **There is exactly one live writer of `discovery_events.village`.** A repo-wide search (no extension
filter) finds the table written in `lib/discovery-gate.ts` and in `scripts/migrate-from-sheets.cjs`; the
latter is referenced by **no** workflow and **no** package script (grep exit 1), so it never runs. Every
live path — the scraper's Pass A via `/api/discovery/ingest`, `/api/inbound-schedule`, the backfill —
goes through the gate.

The gate's write:

```ts
.upsert({
  event_date, start_time, end_time, truck_name, venue_name,
  village: row.village || null,          // ← village IS in the payload
  …
}, { onConflict: 'event_date,truck_name,venue_name', ignoreDuplicates: false })
```

**So: a re-scrape DOES overwrite the village on an existing row.** `ignoreDuplicates: false` means a
conflict updates rather than skips, and `village` is in the payload. Two conditions and one consequence:

1. **The conflict key is `(event_date, truck_name, venue_name)` and does not include village**, so the
   same row is matched and updated as long as the scraper re-emits that date, truck and venue text. If
   the venue text changed, a **new row** is inserted and the old one is left behind untouched.
2. It only reaches rows the scraper emits again — future dates still inside a recurring rule's window.
   Past-dated rows are never re-emitted, so their villages stay as they are.
3. 🔴 **The overwrite writes `null`, not a correct village.** `row.village || null` turns the corrected
   prompt's `""` into `null`. The row stops carrying a false village and starts carrying no village.

**Net: fixing the prompt repairs the *lie* on re-scraped future rows, and links none of them.** R5's
refusal reason changes from `no anchor for village "Recreation Ground"` to no anchor at all. The row
stays unlinked, which is the correct outcome when the location is genuinely unknown.

One side benefit, same mechanism: the gate creates a venue only when `row.venue_name && row.village`, so
an empty village also stops new junk venues being minted on a place description.

## B4 · Is a corrected village enough to re-resolve automatically? **No.**

**R5 must still run afterwards, and `venue_id` must stay NULL where it fails.** The evidence is the same
evidence that made the 221 figure a ceiling rather than a forecast:

- 🧪 **Only 4 of the 224 refusals carry any independent evidence** (a postcode anywhere in the event's
  own text) that the matched venue is the right one.
- 🧪 **Where that evidence existed, the match was WRONG twice out of three** — `foodPark` [CB1] with
  event postcode CB1 2GB matched to the CB2 0AA Biomedical site, and `Wine-Boutique` [Felixstowe] with
  IP11 7BL matched to Sudbury CO10 2AG. Both are different places.
- 🔴 **Part A is itself a third piece of the same evidence.** Until today the matcher preferred a venue
  26.9 km away over one 8.8 km away, on 17 rows, because of a UUID. A pipeline that trusted the matcher's
  output without an acceptance check would have attached all 17 to the wrong pub and shown them on the
  map.

So the order that is safe is **match → R5 → link, and NULL when R5 refuses** — exactly what the gate does
now. A corrected village improves R5's *input*; it does not replace R5. Given the choice you stated — a
`venue_id` left NULL versus an event attached to the wrong venue — nothing here justifies dropping the
check, and the 53 rows whose venue does not exist at all cannot be helped by either: they need a venue
row created, with a real postcode, before anything can link to them.

---

# HOW I CHECKED

The matcher was **executed**, not reasoned about: `findVenue`, `r5Accept` and `villageAnchors` were
loaded from the shipped source by compiling it with the repository's own TypeScript, and run over a
frozen snapshot of all 933 events and 819 venues — once with the committed matcher, once with the edited
one — and the two full result sets were diffed by event id. Distances are haversine against the same
median-of-village anchors the matcher and the gate both use. The diff harness was validated against a
deliberately broken matcher **before** it was used to report success, after three harness errors in three
previous tasks. The prompt comparison and the upsert trace are source reads, with the writer census run
without an extension filter.

**Not done:** no prompt edited, no data changed, no re-resolution, no schema change, no migration, no
database write, no scrape, nothing installed.

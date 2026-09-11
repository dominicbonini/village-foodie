# The rules that govern a trading truck's schedule — review

**Review only.** No code, schema, migration or data write. The scraper was not run. Nothing outside
`docs/` was touched (`git status` at the end shows the same seven modified files as at the start).

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 🔴 WHERE THE MANUALS ARE WRONG OR STALE

1. **"The suppression table has never held a row… the single conjunct `&& eventRow` accounts for the
   emptiness entirely"** (app manual, V-changelog around the cancel-route fix; repeated verbatim as a live
   comment inside `app/api/events/action/route.ts`). **Half true today.** The table is still empty
   (`rejected_event_signatures`: `content-range */0`), **but the cause named is fixed** — the cancel branch
   now selects `town` (commit `2bf839f`, 18 August) and the suppression write is reachable. It is empty
   because **no operator has rejected a scraped event since the fix**: 0 `cancelled/scraper` rows carry an
   `updated_at` after 18 August. The manual should say *untested since the fix*, not *broken*.
2. **"Only `auto` trucks have scraped events bridged"** (app manual, approval-queue entry). The gate is
   `scraper_preference === 'manual'` → skip; **everything else passes** — `auto`, `both`, and a NULL. The
   CHECK constraint forbids other strings but not NULL. Live there are no NULLs and no `both`, so the
   practical effect is the same, but the rule as written in the code is "not manual", not "auto".
3. **"Gusto: 6 of its 11 `truck_events` arrived this way"** (app manual, shadow-truck section). Stale:
   Pizzeria Gusto now has **52** `truck_events`, **34** of them `source='scraper'`.
4. The scraper manual's §21.3 gate description and §16.4's route trace are **accurate** against today's code.

---

# PART ONE — PLAIN ENGLISH

## Your four beliefs, checked

**(a) A truck can nominate its own website and we scrape it — TRUE.** In Settings the operator chooses
"Find my events automatically", pastes a URL, and presses Verify. Only if the verify actually finds events
does the app record the URL and switch the truck to automatic. Three trucks are enrolled today: **Pizzeria
Gusto**, **Pizza Kitchen** (the test truck) and **Village Spice** — the last one pointing at Gusto's own
website. Six others are on "I'll add events myself".

**(b) Scraped events are presented for approval before going live — TRUE, with one gap.** Every event the
bridge creates lands as *unconfirmed*, the operator gets one email per scrape listing them, and the Schedule
tab shows them under "Needs your approval". The gap: that list shows **upcoming** events only. Three
unconfirmed rows sit in the table today dated **13 June, 6 July and 8 August** — nobody actioned them, and
now nobody can see them. They are harmless (past-dated) but they will never clear themselves.

**(c) If they reject an event, it does not come back — TRUE IN CODE, UNPROVEN IN DATA.** Reject stores a
"memory" of the event (truck + date + the venue name as first scraped) and the bridge checks that memory
before creating anything. Undo deletes the memory. But the memory table is **empty** — the write was broken
until 18 August and no reject has happened since — so this has never been exercised end to end. Its blind
spots are in Part Three, §4.

**(d) Once approved, nothing changes it without a manual edit — TRUE, and here is why it is true rather
than merely unobserved.** The bridge only ever **inserts**; there is no "update if it already exists"
anywhere on this table — I searched for the instruction that would do that and it does not exist in the
codebase. On a re-scrape, the bridge looks for an existing row for that truck on that date at that venue
and, finding one, **does nothing at all**. The row is not touched, not re-created, not refreshed. The best
evidence is the operator's own test: on 28 June the test truck renamed an approved scraped event to
*"The Lion (Edited-see if event appesrs again)"*. The scrape ran many times after that; the row kept the
edited name, was not duplicated, and eventually closed normally.

Three honest qualifications to (d):
- **It also means an approved event is never *corrected*.** If the truck's website moves the event from
  17:00 to 18:00, the approved row keeps 17:00 forever. Safety and staleness are the same property here.
- **The same event can come back as a second, unapproved row** if the website renames the venue enough
  that the dedup no longer recognises it (Part Three §3). The approved row is untouched; the operator is
  simply asked again.
- **Status does move without the operator**: a scheduler opens a confirmed event at its start time and
  closes it at its end time. That is the trading lifecycle, not a change to what was approved.

## The journey of a scraped event, in one paragraph

The scraper reads the truck's website and posts what it found to a single shared door in the app. That
door writes every row into the public discovery table, then — for rows whose truck is linked to a real
HatchGrab account and whose owner has not chosen "I'll add events myself" — it asks three questions: *has
the operator rejected exactly this before?* (skip), *does this truck already have this event on this date?*
(skip), and otherwise *insert it as unconfirmed and email the operator*. The same door is used by the
scraper, the Google Apps Script and your admin screenshot upload, so every one of them inherits these rules
identically.

## 🔴 The interaction you asked about — your duplicate checker and this bridge

**The bridge never reads `discovery_events`.** It acts on the rows *in flight* — the list that just arrived
in the request — before, during and independent of what lands in the discovery table. I checked every file
that names both tables: none reads discovery events to create truck events.

So: **a discovery row flagged as a duplicate and hidden from display would still be bridged**, and the
operator would still be asked to approve it. Your checker, if it works on the stored table or in the
display layer, **cannot disturb `truck_events`** and cannot stop an operator being asked. That is the
answer you wanted.

**The one way to get it wrong, said plainly:** if the checker were built *inside* the shared door — trimming
rows out of the in-flight list before the bridge loop runs — then a discovery row suppressed as a duplicate
of some *other* writer's row would also be dropped from the bridge, and **an operator could miss an event
they should have seen**. Put the checker anywhere except in that list, and the two systems stay separate.

There is a second, subtler point worth having in mind while you design: the bridge already has a *better*
duplicate key than the discovery side — it treats two rows as the same event when they resolve to the same
**venue record**, not just the same venue *spelling*. Ten of the discovery side's probable duplicates are
exactly that case. The bridge's rule is the shape the discovery checker should probably borrow.

---

# PART TWO — THE NUMBERS, RE-DERIVED TODAY

All counts asserted against `content-range`.

| | |
|---|---|
| `truck_events` | **137** rows |
| `trucks` | **9** — `scraper_preference`: **manual 6, auto 3, both 0**, NULL 0 |
| Enrolled for scraping (`auto`/`both` **and** a `schedule_url`) | **3** — Pizzeria Gusto, Pizza Kitchen (test), Village Spice |
| `discovery_trucks` linked to a HatchGrab account (`hatchgrab_truck_id` set) | **4** — Test Kitchen→Pizza Kitchen (auto), Pizzeria Gusto (auto, shadow **excluded=true**), Real Thai Food (manual), Tikka Tonic (manual) |
| `rejected_event_signatures` | **0 rows, ever** |

### `truck_events` by status × source

| status | scraper | manual |
|---|---|---|
| unconfirmed | **3** (all past-dated: 2026-06-13, 07-06, 08-08) | 0 |
| confirmed | 6 | 9 |
| open | 0 | 0 |
| closed | 45 | 47 |
| cancelled | 26 | 1 |

**Pizzeria Gusto:** 52 rows — scraper 34 (closed 21, cancelled 10, confirmed 2, unconfirmed 1), manual 18.

### Evidence bearing on (d)

| check | result |
|---|---|
| `onConflict` on `truck_events` anywhere in the repository | **none** (grep exit 1 — searched, found nothing) |
| scraper-sourced rows where the operator's `venue_name` differs from the immutable `scraped_signature` | **1 of 80** — the test truck's deliberate rename, which survived every later scrape |
| scraper-sourced rows whose `updated_at` is after `confirmed_at` | 14 — **every one is now `cancelled` or `closed`**: operator cancels and the scheduler's close, no content change attributable to a scrape |

---

# PART THREE — THE DETAIL, BY QUESTION

Citations are by symbol.

## 1. The full gate sequence, scrape → `truck_events`

**Before the door (Pass B in `scripts/run-scraper.js`, HatchGrab loop):**

| step | test | on failure |
|---|---|---|
| enrolment query | `trucks` where `scraper_preference in ('auto','both')` (or the one id in `SCRAPE_TRUCK_ID`) | not scraped |
| `schedule_url` present | `if (!hgTruck.schedule_url) continue` | skipped |
| pacing | `shouldRunToday` (**hard-coded true — disabled**) AND `isDueByLog` (due-window from `scraper_run_log`, `dueWindowHours = max(1, 24/n − 1)`) | skipped this run; `SCRAPE_TRUCK_ID` bypasses both |
| unchanged page | `scraper_last_text_hash` equals the page text hash | extraction skipped |
| extraction | Gemini → `extractEvents` → `isValidEvent` = **venue name non-empty AND a date. Nothing else** — no past-date drop, no `private` filter | dropped |
| zero events | retry with the other scroll rule; if that finds some, `scraper_rule` is re-pinned; else empty-schedule notice, throttled by `scraper_last_empty_notify_at` | — |
| POST | to `/api/inbound-schedule`; `assertInboundOk` throws on a non-2xx so a dead endpoint is a recorded crash, not a "0 bridged" success | per-truck `crash` row in `scraper_run_log` |

⚠️ Because `isValidEvent` does not test the date, **a past event still on the truck's website is posted,
lands in `discovery_events`, and is bridged** — that is one origin of the three past-dated `unconfirmed`
rows.

**At the door — `POST /api/inbound-schedule`. Every step here is a property of the ROUTE and is inherited
identically by Pass B, the Apps Script and the admin screenshot upload:**

| step | test | on failure |
|---|---|---|
| secret | `secret === INBOUND_SECRET` | **401** for the whole batch |
| row validity | `event_date` parses (`toISODate`) and `truck_name` non-empty | row dropped |
| discovery write | upsert on `event_date,truck_name,venue_name` — **independent of everything below** | **500**, batch stops before bridging |
| linked truck | incoming name vs `discovery_trucks.name` with `hatchgrab_truck_id`, by `normName` **containment either way** — `linkedTrucks.find(...)` | row not bridged |
| preference gate | `trucks.scraper_preference === 'manual'` | row not bridged |
| reject-memory | any `rejected_event_signatures` row for this `truck_id` + exact `event_date` whose signature is a `venuesFuzzyMatch` (≤ 1 edit) of the incoming venue | row not bridged |
| dedup | any `truck_events` row for this `truck_id` + exact `event_date` where **(PRIMARY)** `venue_id` equals the incoming resolved `venue_id`, or **(FALLBACK)** `venueNameDedupMatch` on `scraped_signature ∥ venue_name` | row not bridged |
| insert | `truck_events.insert({ status:'unconfirmed', source:'scraper', scraped_signature: venue_name, venue_id, venue_match_confidence, … })` | logged, `continue` |
| email | one per truck per batch, listing that truck's **upcoming** unconfirmed scraper events, linking to `/manage/<token>?tab=schedule` | logged, other trucks unaffected |

Two things about the linked-truck step worth knowing: the **`excluded` flag on the discovery shadow is not
consulted** — Gusto's shadow is `excluded=true` and bridges regardless; and the link is by **name
containment**, so renaming either side silently breaks it.

## 2. `scraper_preference`

| value | allowed by | meaning (column comment) | what the gate does | who holds it |
|---|---|---|---|---|
| `manual` | CHECK; the default | operator uploads only | **skip** the `truck_events` insert; discovery write unaffected | 6 trucks |
| `auto` | CHECK; the only automatic option the UI offers | scrape only | bridge | 3 — Gusto, Pizza Kitchen, Village Spice |
| `both` | CHECK; legacy, **not offered by the UI** | scrape + upload | bridge (anything ≠ `manual`) | 0 |
| NULL | not forbidden by the CHECK | — | bridge | 0 |

Written by the Settings page through `update_truck`, whose allow-list includes the column; the server does
**not** validate the value — the CHECK is the only guard. Enrolment for Pass B is exactly
`schedule_url IS NOT NULL AND scraper_preference IN ('auto','both')`.

## 3. The approval states, and (d) traced

`truck_events_status_check` allows exactly **`unconfirmed`, `confirmed`, `open`, `closed`, `cancelled`**.

| status | set by |
|---|---|
| `unconfirmed` | the bridge insert; `restore_rejected` (undo of a reject) |
| `confirmed` | `confirm` in `events/action` — Approve / Edit & Approve; also manual events created already-confirmed via `upsert_event` |
| `open` | `auto-event-scheduler` when a `confirmed` event with `auto_open` reaches `start_time` |
| `closed` | `auto-event-scheduler` when an `open` event passes `end_time` (or its date is past) |
| `cancelled` | `cancel` in `events/action` — the operator's Reject (with `suppress: true`) or Cancel |

**What approval actually changes:** `confirm` writes `status`, `confirmed_at`, `auto_open`, `auto_close`,
`venue_address`, `customer_note`, and a `van_id` if the truck has exactly one. It refuses without both
times (`hasValidEventTimes`) and, for a multi-van truck with no van chosen, refuses too. It does **not**
touch the venue, the date, the coordinates or `scraped_signature`.

**(d), traced to the instruction that would break it.** A re-scrape of an already-approved event reaches
the dedup step with the same `truck_id` and `event_date`. If the venue resolves to the same `venue_id`, or
the name matches under `venueNameDedupMatch`, `isDup` is true and the loop does `continue` — **no write of
any kind**. If it were to pass dedup, the only write that follows is `.insert(...)`; there is **no
`.upsert`, no `onConflict`, and no `.update` on `truck_events` anywhere in the bridge** — and repo-wide,
no `onConflict` targets this table at all. So the only two outcomes of a re-scrape are *nothing* or *a new
unconfirmed row*. **An approved row cannot be silently changed by a scrape.** The operator's `update`
action has an allow-list (`venue_name, venue_address, start_time, end_time, customer_note, auto_open,
auto_close, notes`) that deliberately excludes `scraped_signature` and `venue_id`, so a manual edit cannot
break the dedup that protects the row either.

## 4. `rejected_event_signatures`

**Built from:** `truck_id` + `event_date` + `scraped_signature ∥ venue_name` of the rejected row, written by
`cancel` when the payload carries `suppress: true` (the Schedule tab's Reject sends it). **Matched by:**
exact truck, exact date, and `venuesFuzzyMatch` — at most one character of difference — on the normalised
venue. Deliberately **not** the looser containment rule: a false suppression silently loses a real event.
**Lifetime:** forever — no expiry, no retention job, no unique constraint; deleted only by `restore_rejected`
(the undo) or the cascade when the truck is deleted.

**What it cannot catch:**
- The same event with the venue spelled more than one edit differently — `Off The Beaten Truck -
  Northstowe` vs `Northstowe` will **not** match, so the rejected event returns under the other name. This
  is exactly the discovery side's failure, imported.
- The same event on a **different date** — a rejected recurring event comes back next week.
- A **time** change — the signature has no time, so it neither helps nor hurts.
- It cannot compare on `venue_id` — the signature is a string, so the bridge's better key is unavailable
  here.
- And, as of today, **anything at all** — it has never held a row.

## 5. The bridge's own dedup — mirror, or fourth copy?

**A deliberate mirror plus one deliberate divergence plus one addition — not a §51.7 accidental copy.**

- `normalizeVenue` and `venuesFuzzyMatch` in `lib/venue-signature.ts` are documented byte-mirrors of the
  scraper's `normalizeName` and `isFuzzyMatch`. **Executed today** over all 1,025 real venue and
  discovery-truck names: **0 normaliser differences; 0 verdict differences across 524,800 pairs.** The
  copies agree.
- `venueNameDedupMatch` (defined in the route) = fuzzy **OR** containment **only when both strings are ≥ 5
  characters**. The scraper's own inline rule is bare containment. That gate is the divergence, and it cuts
  both ways: `The Star` / `The Star Pub` is a duplicate to the scraper and **distinct** to the bridge
  (`star` is 4 characters). Both rows exist in `truck_events` today.
- The `venue_id` PRIMARY key has **no equivalent on the discovery side at all**.

Real same-day pairs in `truck_events`, run through the shipped rule: `Ashdon Village Hall` (manual) vs
`Village Hall Car Park` (scraper) → **distinct** — the operator entered it, the scrape brought it again, they
rejected the copy. `Music Festival` vs `Bures Music Festival` → duplicate under today's rule; those rows
predate or straddle 30 June, when the containment fallback landed.

## 6. The interaction — answered in Part One; the evidence

- The bridge loop is `for (const row of rows)` where `rows` is the parsed request body. Nothing in the
  route selects from `discovery_events`.
- Every file naming both tables was checked (`app/admin/page.tsx`, the discovery feed, the admin
  discovery-events editor, the outreach templates route, `events/action` — a comment only,
  `lib/admin/screenshot-events.ts` — a comment only, `run-scraper.js`, one migration): **none reads
  `discovery_events` to write `truck_events`.**
- Therefore a `discovery_events` row marked duplicate-and-hidden is invisible to the bridge; and the only
  design that could stop an operator being asked is one that edits the in-flight `rows` list inside the
  route before the loop.

## 7. What else applies to linked trucks

- **Enrolment is only via a successful Verify** — a pasted-but-unverified URL is never enrolled.
- **The link is by name containment to a `discovery_trucks` shadow**, `excluded` or not; the shadow must
  exist for the bridge to fire at all.
- **Pacing:** hourly cron, per-truck due-window from `scraper_run_log`; the day-of-week gate is disabled.
- **Unchanged pages are not re-extracted** (`scraper_last_text_hash`); schedule changes are tracked
  (`scraper_last_hash` / `scraper_last_changed_at`).
- **A zero-event scrape retries with the other scroll rule** and re-pins the winner; a persistent empty
  schedule triggers an operator notice, throttled by `scraper_last_empty_notify_at`.
- **Confirm requires both times and, for multi-van trucks, a chosen van**; a confirmed van-less event
  takes orders with no capacity limit (`kitchenCapacity` null = unlimited).
- **`auto-event-scheduler` opens and closes confirmed events on their times; `heartbeat-monitor` pauses
  an open event when the device drops offline.** Both write `truck_events` without the operator.
- **The approval queue and the email show upcoming events only** — past-dated unconfirmed rows are
  invisible forever.
- **Low-confidence venue matches are flagged on the approval card** (`venue_match_confidence === 'low'`),
  and a scraped event with no coordinates shows a warning — but the pin still becomes public on approval.
- **New scraped events inherit the truck's order-ready default** (`getVanOrderReadyDefault`).
- **Every write to `truck_events` in the operator routes is ownership-gated** by `truck_id`; the cancel
  branch 404s on a foreign or unreadable event by construction.

---

# HOW I CHECKED

**Executed:** the 1,025-name / 524,800-pair matcher agreement test; `venueNameDedupMatch` over the real
same-day pairs; every count in Part Two, asserted against `content-range`.

**Structural (read, not run):** the route's gate order and the `insert`-only write; the `events/action`
branches; the migrations' CHECK constraints; the edge functions' selection criteria; the git history dating
the dedup rules (`venue_id` PRIMARY and containment fallback: 30 June 2026; signatures and reject-memory:
11 June 2026; the cancel-route fix: 18 August 2026).

**Reasoned:** that the 14 post-approval `updated_at` values are operator cancels and scheduler closes —
consistent with their statuses, but `updated_at` has no trigger (grep exit 1) and is written only by some
routes, so it is not a complete audit trail.

**Not established:** whether the reject → suppress → re-scrape loop works end to end — it has never run.

**Search method:** no search was scoped by file extension. "Found nothing" was distinguished from "errored"
by printing each grep's exit status: **1** = ran and found nothing (the `onConflict` and trigger searches);
**0** = found; **2** = error (none occurred).

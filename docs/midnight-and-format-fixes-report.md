# Events that run past midnight, US format bugs, and Import review's empty time boxes

17 October 2026. Source: docs/us-layout-audit-report.md ("Not layout" items 1–5). Nothing is committed, pushed or deployed, and no stored data was changed. The work starts from commit `692adb4`.

## Summary

| Item | Result |
|---|---|
| **1 · Diagnosis** | Events that run past midnight were not built: `hasValidEventTimes` refused any end at or before the start ("Overnight events are unbuilt"). If one had been saved anyway, about 60 decisions in ~35 files would have read its end, and its after-midnight slots, as times on the **start** date. **Live data has none:** 0 events with end ≤ start, and 0 orders with a slot before their event's start. |
| **2 · Fix** | **One rule, in one module (`lib/event-window.ts`):** end earlier than start means the end is the next day's, and on such an event a time earlier than the start is the next day's too. End equal to start keeps today's behaviour. Every decision point now uses the rule, and the gate allows overnight events. A 20:00–00:30 event (GB and US): ordering stays open until 00:30, slots run through 00:30, a 00:15 order reads "in 25m" at 23:50, Add order offers slots after midnight, and Manage keeps the event under Upcoming until 00:30. **Normal events are byte-identical everywhere.** |
| **3 · US format bugs** | Fixed; GB byte-identical: the public truck page and the embed/custom-domain schedule use the truck's own time settings ("Wed, Sep 30 · 11:30 AM – 10:45 PM", with a no-break space before AM/PM); the dashboard's Completed list uses the truck's time format; the Change finish time modal uses the truck's format and zone. |
| **4 · Import review** | Every Start/End box now shows its value at 390, 800 and 1280 (BEFORE: 0 px for the value). The desktop table no longer scrolls sideways at 800, 810 or 1180 (BEFORE: 268 / 258 / 56 px). |
| **Proof** | `scripts/midnight-events.cjs` (new): **334 checks over 1,085 views, 0 failed.** The full sweep: **131 run · 131 passed · 0 failed.** `tsc` is clean, `next build` exits 0, and no eslint rule count grew in any of the 50 touched product files. |

**For Dominic to do** (details under "Decisions" and "Deploy"):
- deploy the `auto-event-scheduler` edge function separately;
- decide the two items left as they were: end = start, and the UTC "today" in two public feeds for normal events.

## Garbled spans and contradictions

- **No garbled spans.**
- **No contradictions.** One assumption had to be revisited. The brief asks for a 20:00–00:30 event to work, but the product refused to save one at all (`hasValidEventTimes`, the Manage editor's end-time filter, and the importer blanking the end). Opening that gate is part of the fix. End = start stays refused, as the brief requires.

## 1 · Diagnosis

### How it was stored, and what's live

**Storage:**
- An event is `truck_events.event_date` (`date`) plus `start_time` and `end_time` (`time without time zone`), read in the truck's zone (`trucks.timezone`, else the country's default).
- An order's slot is text "HH:MM" (`orders.slot`, `requested_slot`) with `orders.event_id`.
- **There was no representation of an overnight event:** nothing adds a day to the end. The only existing calculation that crosses midnight is the pre-order cut-off (`lib/preorder.ts`), which works backwards from the start and is correct.

**Read-only queries:**
```sql
-- events whose end is at or before their start, by truck (past and future), incl. Pizzeria Gusto
select e.truck_id, (e.event_date >= current_date) as future, count(*) as events,
       count(*) filter (where e.end_time = e.start_time) as end_equals_start
from public.truck_events e
where e.start_time is not null and e.end_time is not null and e.end_time <= e.start_time
group by 1,2 order by 1,2;
-- → 0 rows
```
```sql
select 'orders with slot earlier than their event start' as what, count(*)::text as n
from public.orders o join public.truck_events e on e.id = o.event_id
where o.slot ~ '^\d{1,2}:\d{2}$' and e.start_time is not null and o.slot::time < e.start_time
union all
select 'orders on events that end at/before start', count(*)::text
from public.orders o join public.truck_events e on e.id = o.event_id
where e.end_time is not null and e.start_time is not null and e.end_time <= e.start_time
union all
select 'distinct slot formats (sample)', string_agg(distinct regexp_replace(coalesce(slot,'∅'), '\d', '9', 'g'), ', ') from public.orders
union all
select 'truck_events with start or end null', count(*)::text from public.truck_events where start_time is null or end_time is null
union all
select 'discovery_events with end <= start', count(*)::text from public.discovery_events where start_time is not null and end_time is not null and end_time <= start_time;
-- → 0 · 0 · "∅, 99:99" · 21 · 0
```

**What this means:**
- **No data needs changing,** so there is no NOT RUN SQL.
- The 21 events with a missing time keep today's behaviour: the rule needs both times.

### Every place that decides from an event's times

**Verdict for a 20:00–00:30 event before this work**, and the fix. "Wrong" means:
- **A:** minute-of-day arithmetic;
- **B:** an instant built from `event_date` + end/slot;
- **C:** an `event_date >= today` filter.

| Area | Decision (file) | Before | Now |
|---|---|---|---|
| **Gate** | `hasValidEventTimes` (lib/time-utils); Manage editor end options (`minExclusive`), `endIsNotAfterStart`, `validateEventForm`; importer (`lib/schedule-extract`) | refused / blanked overnight | end < start allowed; end = start refused |
| **Customer** | order page `isEventClosed` | wrong (A): "closed" all evening | open until 00:30 the next day |
| | events list filter, fallback hour picker, ASAP estimate ("24:10"), unfittable slots, backward ASAP, snap-back, slot `<select>` filters | wrong (A/B) | event timeline; never "24:xx" |
| | `/api/orders/cancel` cut-off; receipt `isPastCutoff` | wrong (B): refused all evening | slot instant on the next day |
| | `/api/menu` QR auto-detect; `/api/events` customer feed | wrong after midnight (C) | read from yesterday, keep if still running, limit after filter |
| | `/api/orders/submit` date fallback (no event id) | wrong after midnight | a running overnight event from yesterday |
| | pre-order cut-off / open (`lib/preorder`), auto-accept | correct (start-anchored) | unchanged |
| **Slots & capacity** | `generateCollectionTimes`, `generateSlots` | wrong: empty grid | walk past midnight, canonical "HH:MM", in order |
| | `isSlotPast`, `getAsapSlot` | wrong (A) | event timeline when given the event |
| | `buildSlotAvailability` now-clamp / is_past / grace / too-soon; backward fit; dots; capacity breaches; slot indicators | wrong (A) | the engine gets an overnight event's times on an extended clock ("00:15" → "24:15") at each caller, and results are mapped back; engine internals untouched apart from an optional `eventNowMins` |
| | `place-in-slot` grid, end check (everything "full"), now; cooking reservations | wrong | event timeline; stored slot canonical "00:15" |
| | `/api/slots`, `/api/dashboard` grids, floors and now | wrong | as above; slots returned canonical and chronological |
| | `resolveCollectionTime` (late/countdown root) | wrong (B): ~1,200 min late | next-day slot instant |
| **Dashboard** | auto-select, `pickDefaultEventByTime`, today's events, offline cache prune, `finishEvent` early check, prep list sort/timing, Completed row | wrong (A/B/C) | rule throughout |
| | `AddOrderPanel` "This event has ended", slots, ASAP, fit checks, `readyMinsFromNow`, fallback picker | wrong | rule throughout |
| | `OrderCard` late/countdown, `DayLoadStrip` | wrong | "in 25m" at 23:50 |
| | `EventFinishTimeModal` options and "due after" count | wrong; options read in the **device** zone | truck's zone, event timeline, truck's format |
| | `/api/events/manage?upcoming`, dashboard action `get_events`, manual-order fallback | wrong (C) | yesterday + running filter |
| | `/api/events/action` `update` (the finish-time write) | **no validation at all** | `hasValidEventTimes` (refusal `event_times_same` when the times are equal) |
| **KDS** | event fetch, default event, finishing-early, ticket sort (`1970-01-01T…`) | wrong | rule throughout |
| **Printing** | `printWatcher` lead mode | wrong: the 00:15 ticket printed at 20:00 | due on the event timeline |
| **Manage** | Upcoming vs Past (`isPastEvent`), status badge, both pending counts, Past sort | wrong (B): "Finished" all day | rule; Upcoming until 00:30 the next day |
| | `detectEventConflicts` | wrong: never overlapped | timeline across both dates |
| | `/api/manage` initial load | wrong (C) | yesterday + running filter |
| **Public** | `/api/discovery/events` (both legs), `/api/embed/events` | wrong after midnight (C); UTC "today" | overnight events kept while running (see Decisions for UTC) |
| | home list (`app/page.tsx`), date filters (`useVillageData`) | wrong (device clock) | overnight end counted +1 day |
| | calendar links (Google, Outlook, ICS) | wrong: end before start | end on the next day |
| | live "● Live" badge, CTA | correct (status-based) | unchanged |
| **Jobs** | `auto-event-scheduler` auto-close (Supabase edge function) | wrong: closed an overnight event on the first tick | mirrored rule, parity-tested; **deploy needed** |
| | auto-open, heartbeat, auto-reject, stranded/stale authorisations, other crons | correct (status / instants) | unchanged |
| **WhatsApp** | upcoming events (shared lib + **two inline copies** in the webhooks) | wrong after midnight (C) | one shared function; prompt says "ends after midnight" |
| **Graphics** | weekly-post event pickers | wrong after midnight (C) | yesterday + running filter |
| | poster/caption text, week ranges, place stats | display / start-anchored | unchanged |
| **Emails** | confirmation / new-order / cancelled emails | display only (slot with no date) | unchanged |

## 2 · The fix: one rule

**`lib/event-window.ts`** (client-safe) is the only place the rule lives. Its two basic predicates, `crossesMidnight` and `clockMins`, sit in `lib/time-utils.ts` (the module with no imports) so that module can use them too. Every other caller imports from `event-window`.

- **The event timeline:** a time's minutes after 00:00 on `event_date`, +1440 for a time on the next day.
  - `nowOnEvent` puts "now" on the same axis.
  - For a normal event today these are exactly the old minute-of-day numbers, which is why normal events cannot move.
- **Instants:** `eventTimeDate`, `eventTimeInstant`, `eventEndInstant`, `eventDates`.
- **The engine clock** (`engineClock`, `toEngineClock` / `fromEngineClock`):
  - **What it does:** the capacity engine parses slots as minute-of-day and sorts them as strings, so an overnight event's after-midnight times are handed to it as "24:15" and turned back to "00:15" when they leave.
  - **Where times stay "HH:MM":** storage, screens, emails, tickets and payloads always hold the canonical form.
  - **Normal events:** it is the identity.
- **Upcoming:** `upcomingQueryFloor` (yesterday) plus `isUpcomingOrRunning`. Every `event_date >= today` read now starts at yesterday and keeps only rows that are upcoming or still running. A query's LIMIT moved after the filter, so yesterday's rows can never crowd out upcoming ones.
- **The edge function** can't import `lib/`. It carries a minimal mirror of the rule (`shouldAutoClose`), named as such, and the proof checks it against `lib/event-window` across 11,520 cases (4 event shapes × auto-close on/off × 5 days × 288 minutes).

**Behaviour of a 20:00–00:30 event, as proved (GB and US):**

| Moment (truck's clock) | Order page | Slots offered / ASAP | A 00:15 order | Dashboard / KDS | Manage |
|---|---|---|---|---|---|
| 19:00 (before) | pre-order, open | 20:00 … 00:30 | "in 5h" | today's event | Upcoming |
| 23:50 | open | 00:00, 00:15, 00:30 · ASAP 00:00 | "in 25m"; books 00:15, not pending | today's event; Add order offers 00:00–00:30 | Upcoming |
| 00:15 (next day) | open | 00:15, 00:30 · ASAP 00:15 | "now" | still today's event; not "ended" | Upcoming |
| 00:31 | "Ordering has closed" (ended at 00:30 / 12:30 AM) | none | "16m late" | event over; next event selected | Past |
| next afternoon | closed | — | — | next event | Past |

**Also proved:**
- the slot is stored as "00:15";
- capacity counts the order against the 00:15 window;
- its ticket prints only after midnight;
- the cancel cut-off is measured from 00:15 on the next day: a 20-minute cut-off allows cancelling at 23:50, and a 30-minute one doesn't;
- the feeds, embed, WhatsApp and QR auto-detect keep the event until 00:30;
- calendar links end at 00:30 the next day;
- the edge function doesn't close it early.

## 3 · US format bugs

- **Public truck page:** `app/trucks/[slug]/page.tsx` now also selects the truck's `timezone` and passes `truckTimeSettings(row)` through to `TruckListCard`.
  - A US truck shows "Wed, Sep 30 · 11:30 AM – 10:45 PM".
  - A discovery-only truck, or a GB truck, shows exactly what it did; GB settings equal `DISCOVERY_TIME_SETTINGS`, as checked.
- **Embed and custom-domain schedule:** `/api/embed/events` returns the truck's `time`, and `EmbedSchedule` passes it to the card.
- **Each time kept whole:** in the card's 12-hour range the space before AM/PM is a no-break space (U+00A0). 24-hour (GB) is unchanged. The A-07 wrap at 768 px is left for the layout batch, as asked.
- **Dashboard › Completed list:** `{o.slot}` → `formatSlot(o.slot, dashTime)`, so US reads "🕐 6:30 PM".
- **Change finish time modal** (dashboard and KDS):
  - every time shown follows the truck's format ("currently set to finish at 9:00 PM", "9:00 PM (current)"), while the option values stay "HH:MM";
  - the options are now read in the **truck's zone** instead of the device's. This is the bug the inventory found, and it changes the list itself for a device in another zone (named in the harnesses as `midnight-finish-options-truck-zone`).

## 4 · Import review

- **Cause:** the review passed its text-input classes (`ci()`, `fieldCls()`) into `EventTimeSelect`. The shared `Select` puts the caller's class (padding and border) on its wrapper, while the inner select keeps its own `px-2 pr-7`. In the review's narrow cells that left 0 px for the value.
- **Fix:** no restyle beyond these, and only Tailwind classes already in the compiled CSS.
  - The review's time boxes get their own class (`tci` / `timeCls`) without the input padding.
  - The card time pair stacks below `sm`.
  - The cards/table switch moved from `md` to `lg`.
  - The table's columns were refitted: time 132 px GB / 156 px US, date 120, area 100, postcode 84, van 110, and the venue takes the rest.
- **Measured in WebKit with the compiled CSS** (`midnight-events` › manage, views `fix|…|import|…`):

| | BEFORE | Now |
|---|---|---|
| Value space in each time box | 0 px (nothing visible) | every value fits, GB and US, at 390 / 800 / 1280: ≥57 px spare in the cards, ≥1 px spare in the content-sized table selects |
| Sideways overflow at 800 / 810 / 1180 / 1280 | 268 / 258 / 56 / 0 px | 0 everywhere |

- **The overnight hint:** "Ends the next day" now shows under an imported row whose end is earlier than its start.

## Proof

### `scripts/midnight-events.cjs` (new, in the sweep): 334 passed, 0 failed

**Method:**
- **Six area modules** render or call the REAL modules on fixtures: Pizza Kitchen, the in-memory database, no network:
  - `scripts/_midnight-core.cjs`, `-engine`, `-customer`, `-dashboard`, `-manage`, `-public`;
  - shared fixtures in `scripts/_midnight-fixtures.cjs`.
- **Moments:** GB (Europe/London) and US (America/New_York), at the same wall-clock moments.
  - A **20:00–00:30** event at 19:00, 23:50, 00:15, 00:31 and the next afternoon.
  - A **normal 11:30–22:45** event at 11:00, 12:00, 22:40, 22:50 and the next afternoon.
- **BEFORE:** captured on a clean worktree of `692adb4` with the capture modules copied in, twice, byte-identical (1,085 views).
- **Rules:** every **normal** view must be byte-identical to BEFORE; every **midnight** view is checked against the rule above.

| Area | Views | Checks | What's covered |
|---|---:|---:|---|
| core | 90 | 21 | grid, is-past, ASAP, `resolveCollectionTime`, default event, the gate (end = start still refused) |
| engine | 232 | 58 | real `/api/slots`, `/api/dashboard` (dated and undated), `get_events`, `placeOrderInSlotLocked` (00:15, 21:00, ASAP; reservation switch on and off), breaches, indicators, print watcher, `generateSlots` |
| customer | 232 | 38 | order page (static and mounted): closed banner, offered slots, ASAP, queue estimate, engine fit; `/api/events`; `/api/menu` auto-detect; cancel route and receipt cut-off windows |
| dashboard | 226 | 61 | OrderCard labels, order sort, prep list, AddOrderPanel (ended / slots / ASAP), DayLoadStrip, KDS sort and finishing-early, finish-time options and due-after, `events/manage` upcoming, `events/action` validation; US format views |
| manage | 84 | 103 | Upcoming/Past, badge, pending counts, editor end options and hint, conflicts, importer, `GET /api/manage`, `upsert_event` slots; Import review measured in WebKit |
| public | 221 | 53 | discovery feed (both hosts and legs), embed, WhatsApp window and prompt, weekly-post pickers, home list, calendar links, edge-function parity, US card format, webhooks without inline copies |

**Normal views across all areas: byte-identical to BEFORE.** For contrast, BEFORE shows the bugs:
- "Around 24:00";
- closed at 23:50;
- "1415m late" at 23:50;
- no slots after midnight;
- the event dropped from every feed at midnight;
- the 00:15 ticket printing at 20:00.

### The rest

| Check | Result |
|---|---|
| Full sweep `node scripts/run-harnesses.cjs` | **131 run · 131 passed · 0 failed** |
| `npx tsc --noEmit -p .` | clean |
| `next build` | exit 0 |
| eslint, every touched product file (50) vs HEAD | **no rule count grew** |

### Re-pins (each a precise or structural named entry; no BEFORE was recaptured and no check was deleted)

- **`scripts/_lp2-named.cjs`** (Phase 1b / 2 tables):
  - `midnight-card-time-nbsp-US` (48 US card views);
  - `midnight-closedAtTime-fixture-GB`;
  - `midnight-dayloadstrip-event-prop` (176 dashboard stub views: the new prop, no rendered change);
  - `midnight-finish-modal-time-prop`;
  - `midnight-completed-slot-US`;
  - `midnight-finish-options-truck-zone` (computed from the rule);
  - `midnight-finish-modal-format-US`.
- **`scripts/language-phase-1a.cjs`:** the "closed at time" fixture was 17:00–15:00, which the rule now reads as an overnight event, so it was open. It is now a normal 12:00–15:00 event, checked at 16:00.
- **`scripts/_lp1d-named.cjs` / `_lp1d2-named.cjs`:**
  - `midnight-end-select-not-same-as` (the end options, rebuilt from the rule);
  - `midnight-ends-next-day-hint`;
  - `midnight-import-review-layout` (exact class, breakpoint and column-width changes);
  - 1d2 reuses the Phase 2 entries by id, so there is no second copy. The `timeSelect` fixture now also passes `notSameAs`.
- **`scripts/event-types.cjs`:** 13 dashboard lines named, plus a companion check that each replacement exists; the `getAsapSlot` pin accepts the event argument.
- **`scripts/schedule-graphics-places.cjs`:** 30 Manage lines named, plus a companion check; the public card line accepts `time={time}`.
- **`scripts/screenshot-truck-details.cjs`** (+ its 2D-2 fixture): the importer's changed lines named.
- **`scripts/social-posts.cjs`:** the weekly-post read is still forward-only (from yesterday) and bounded (400, after the filter).
- **`scripts/private-events.cjs`:** the two webhooks are checked as delegates. They read upcoming events only through `fetchUpcomingTruckEvents`, which is itself a checked, redacting surface, and they hold no `truck_events` query of their own.
- **`scripts/phase3-screens.cjs`:** the status API's two new keys (`event_start_time`, `event_end_time`) are named and asserted present.
- **`scripts/time-dates-parity.cjs`, `event-pricing.cjs`, `batch-reservation-writers.cjs`, `add-order-fit-message.cjs`:** the agents re-pinned source patterns that moved.
- **One real regression was caught and fixed, not re-pinned:**
  - **Cause:** `generateCollectionTimes` briefly wrapped **every** event's grace slots at midnight. A normal event ending at 23:45 used to get "24:00/24:15" grace labels and briefly got "00:00/00:15".
  - **Fix:** the wrap now applies only to overnight events, and `scripts/slot-interval-generator.cjs` confirms the generator is byte-identical to HEAD across 4,644 combinations.

## Decisions recorded

1. **End = start keeps today's behaviour:** refused ("The end time can't be the same as the start time" in the editor; `event_times_same` from the event-update API).
   - **Why:** the brief asked for that.
   - **Decision for Dominic:** zero-length or 24 hours.
2. **The next-day rule for a slot applies only to an event that crosses midnight.** A slot earlier than a *normal* event's start keeps today's meaning. Normal events are byte-identical everywhere, and live data has no such slots.
3. **The engine clock** ("24:15" inside the capacity engine only) instead of threading the event through every engine function. Storage and screens never see it.
4. **The offline-cache prune keeps yesterday's snapshot for one more day.** This is the one change that also touches normal events, and it affects only a browser cache.
5. **The editor's end field offers every time except the start's own,** with an "Ends the next day" hint under an overnight end. The auto-filled end (start + 3 h, capped at 23:00) never creates an overnight event by itself.
6. **The finish-time modal on a normal event** still offers only times on its own date, so it can't extend a normal event past midnight. Changing that would move normal behaviour. **A decision for Dominic.**
7. **The UTC "today" in `/api/discovery/events` (operator leg) and `/api/embed/events` is left for normal events.** It is a bug that predates this work: GB lists yesterday's events from 00:00 to 01:00 BST, and a US truck loses today's events from 20:00 EDT. Fixing it with the truck's zone changes US normal views, so overnight events alone use the truck's zone. Each route has a comment marking it. **A decision for Dominic.**
8. **Auto-open after midnight:** an overnight event that wasn't opened before midnight isn't opened by the scheduler afterwards. Auto-open is start-anchored, as before, and wasn't in the brief.
9. **The schedule importer's AI prompt is unchanged,** so normal imports stay byte-identical. A misread like "12–3" as 12:00–03:00 would now import as overnight, but the review shows "Ends the next day" under it.

## Deploy

- **The Supabase edge function `auto-event-scheduler` must be deployed separately:** `supabase functions deploy auto-event-scheduler`. Until it is, the deployed copy closes an overnight event early, although the app itself treats the event correctly.
- **No database change is needed:** no NOT RUN SQL.

## Localhost check (Pizza Kitchen only)

**Setup:**
- Use the HatchGrab host: add `127.0.0.1 hatchgrab.localhost` to `/etc/hosts`, run `npm run dev`, and browse `http://hatchgrab.localhost:3000`.
- Open Pizza Kitchen's Manage link (Admin › trucks › Pizza Kitchen) on that host.

**To see the evening side tonight:**
1. In Manage › Schedule, choose **Add event**: today, Start **20:00** (8 PM), End **00:30** (12:30 AM).
2. Under End time, **"Ends the next day"** appears. Save, and confirm the event.
3. Try End **20:00**: Save refuses with "The end time can't be the same as the start time".

**To see the after-midnight side during the day** (no need to stay up): add an event dated **yesterday**, Start **20:00**, End a time **later than now** today (e.g. **18:00** if it's mid-afternoon). That is an overnight event that is still running right now.

| Where | What to check |
|---|---|
| **Order page** `/trucks/test-kitchen/order` | Not "Ordering has closed" while the event runs. The time list includes times after midnight in order (… 23:45, 00:00, 00:15, 00:30), and ASAP never reads "24:xx". After the end, the closed banner reads "ended at 00:30". |
| **Dashboard** | The event is today's event until it ends. A 00:15 order placed at 23:50 shows **"in 25m"**, not "late". **Add order** offers 00:00–00:30, and doesn't say "This event has ended" before 00:30. **Change finish time** offers times after midnight, and its "orders due after" count is right. |
| **KDS** | The 00:15 ticket sits after the 23:45 one, not first (the dashboard list groups by status, in time order within each group). The board keeps the event until it ends, and "Finish early?" wording appears before 00:30. |
| **Manage › Schedule** | The event stays under **Upcoming** (editable, no "Finished" badge) until 00:30 the next day, then moves to Past. An overlapping 21:00–23:00 event on the same date is flagged as a conflict. |
| **Finish time past midnight** (follow-up, 17 October) | On a normal Pizza Kitchen event (e.g. 18:00–23:30), open the dashboard or the KDS, then **Change finish time**. After the same-day times the list continues **00:00 (next day)**, **00:15 (next day)** … up to the time before the start; the start itself isn't offered. Choose **00:30 (next day)**: the confirm reads "This event will finish at 00:30 (next day) instead of 23:30". Afterwards the event behaves as an overnight event everywhere above. A same-day choice reads exactly as before. |
| **"Ends the next day" on waiting cards** (follow-up, 17 October) | Add, or have the email bridge import, an **unconfirmed** event whose end is earlier than its start. Under **Needs your approval** or **Needs confirmation**, its card shows an amber **Ends the next day** pill beside the times; a normal waiting card looks exactly as before. In **Import** review, an overnight row shows **Ends the next day** in amber under its date and time. |
| **Manage › Schedule › Import** (any screenshot or URL) | Every Start/End box shows its time at phone, tablet and laptop widths, and the table doesn't scroll sideways at 800–1280 px. |
| **Public page** `/trucks/test-kitchen` | GB looks exactly as before. A US truck can only be checked on fixtures while the US is off. |

## Files

- **New:**
  - `lib/event-window.ts`;
  - `scripts/midnight-events.cjs`, `scripts/_midnight-{fixtures,core,engine,customer,dashboard,manage,public}.cjs`, `scripts/fixtures/midnight-events-before/`;
  - `scripts/midnight-BRIEF.md` (the shared brief the surface work followed).
- **Rule and gate:** `lib/time-utils.ts`, `lib/slot-utils.ts`, `lib/slot-generation.ts`, `lib/slots.ts`, `lib/prep-utils.ts`.
- **Engine:**
  - `lib/slot-availability.ts`, `lib/capacity-breach.ts`, `lib/slot-display.ts`;
  - `lib/orders/place-in-slot.ts`, `lib/orders/cooking-reservation.ts`;
  - `lib/printing/printWatcher.ts`, `lib/printing/usePrinting.ts`;
  - `app/api/slots/[truckId]/route.ts`, `app/api/dashboard/route.ts`, `app/api/dashboard/action/route.ts`.
- **Customer:**
  - `app/trucks/[slug]/order/page.tsx`, `app/order/[id]/manage/page.tsx`;
  - `app/api/orders/{submit,cancel}/route.ts`, `app/api/orders/[id]/route.ts`;
  - `app/api/menu/[truckId]/route.ts`, `app/api/events/route.ts`.
- **Dashboard and KDS:**
  - `app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`;
  - `components/dashboard/{AddOrderPanel,OrderCard,DayLoadStrip}.tsx`;
  - `components/shared/EventFinishTimeModal.tsx`;
  - `app/api/events/{manage,action}/route.ts`.
- **Manage:** `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `lib/event-conflicts.ts`, `lib/schedule-extract.ts`.
- **Public and jobs:**
  - **Feeds and pages:** `app/api/discovery/events/route.ts`, `app/api/embed/events/route.ts`, `app/embed/[slug]/EmbedSchedule.tsx`, `components/TruckListCard.tsx`, `app/trucks/[slug]/{page,TruckClient}.tsx`, `app/page.tsx`, `hooks/useVillageData.ts`, `lib/utils.ts`;
  - **WhatsApp:** `lib/whatsapp/upcoming-events.ts`, `app/api/webhooks/{meta/whatsapp,whatsapp}/route.ts`, `lib/whatsapp-classifier.ts`;
  - **Weekly post:** `app/api/weekly-post/route.ts`;
  - **Edge function:** `supabase/functions/auto-event-scheduler/index.ts`.
- **Messages:**
  - `manageScheduleEvent.endsNextDay` "Ends the next day";
  - `manageScheduleEvent.errors.endSameAsStart`;
  - `errorsManage.event_times_same`.

  No US differences.
- **Harnesses:** see Re-pins; plus `scripts/harnesses.json` (adds `midnight-events.cjs`).

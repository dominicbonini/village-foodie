# collection-anchor-1: collection times counted from the event's start

*12 November 2026.*
- *Committed on main (only this work's files), not pushed and not deployed.*
- *No database change. Pizzeria Gusto was not touched or queried. No `outreach_templates` rows. No `.env` file was opened.*

## Summary

- **Every interval now counts from the event's start:** 5, 10, 15, 20, 30, 45 and 60 all run start, start + interval, … to the end. Example: an event at 19:00 every 45 minutes offers 19:00, 19:45, 20:30, 21:15.
- **The first time a customer is offered** is the first of these at or after the earliest possible time (the event start, or now + prep/lead time, whichever is later). These are the same rules as before, now applied to this grid.
- **One function builds every list**, so none can disagree: `generateCollectionTimes` in `lib/slot-generation.ts`. It is used by:
  - the customer list (`/api/slots`);
  - the operator's list and the dashboard (`/api/dashboard`);
  - server validation and placement (`lib/orders/place-in-slot.ts`);
  - the customer page's backup picker (now built from the function directly);
  - the manual-order picker (it reads `/api/slots`, and offline the dashboard's cached list);
  - the demo seeder (through the new `firstGridTimeAtOrAfter`);
  - per-event interval overrides (they only change the interval passed in).
- **The hour-by-hour workaround for 45 is removed** (`clockGridMinutes`, `minutesForHour`), along with `firstClockSlotAtOrAfter`.
- **Nothing moves today:**
  - A start that is already a multiple of its interval (17:00 at 15, any start at 5) gets exactly the list it got before.
  - A read-only check of the 18 upcoming events (Pizzeria Gusto excluded, not queried) found none whose start is off its interval, so none of their lists change.
  - Existing orders keep their saved times.
- **Checks:**
  - The extended interval check passes: every interval × 252 start times, plus 17:00, 17:10, 19:00 and 19:45 by name, with server and pickers in agreement.
  - Every related harness passes.
  - The full sweep's remaining failures are another session's unfinished work (§5).

## 0 · Flags

- **No span of the prompt arrived garbled, and no two instructions contradict each other.**
- **`docs/longer-intervals-report.md` does not exist.** That work had no report file, so I read this session's notes and the code instead, as the prompt allowed.
- **This reverses decision D1 of 16 September** (clock anchoring from midnight), at your instruction. The manual records it as V16.17, with the old passages marked "Superseded".

## 1 · What changed

| Where | Before | Now |
|---|---|---|
| `lib/slot-generation.ts` `generateCollectionTimes` | The first time was the first multiple of the interval from midnight at or after the start. | The first time is the start; every later time adds one interval, up to end + grace. |
| `lib/slot-generation.ts` | `firstClockSlotAtOrAfter`, `clockGridMinutes(interval, hour)` | Both removed. New `firstGridTimeAtOrAfter(start, earliest, interval)` gives the first grid time at or after any time. |
| The order page's backup picker (`app/(app)/trucks/[slug]/order/page.tsx`) | Every hour of the event × that interval's minutes, worked out hour by hour at 45. | `generateCollectionTimes(start, end, interval)` itself, from the ASAP time on. |
| The order page's "Around HH:MM" estimate (shown when the server has no list) | Rounded up to the next 5 minutes. | Rounded up onto the event's grid with `firstGridTimeAtOrAfter`. |
| The demo seeder (`lib/seed-demo-orders.ts`) | Its own copy of the midnight rounding. | `firstGridTimeAtOrAfter`. |
| `lib/slot-interval-core.ts` | A comment describing the 45 workaround. | A comment pointing to the one function. |

**Two visible side effects, both corrections:**
1. **The backup picker no longer offers times after the event's end.** The hours × minutes list ran on to the end of the end's hour (a 17:00–21:00 event offered 21:10 … 21:50), times the server never generates. It now stops at the end. The backup picker is only used when `/api/slots` returns no list.
2. **The "Around" estimate now matches the first time offered.** At 15-minute intervals it could read "Around 12:10" beside a first option of 12:15. It now reads "Around 12:15". At interval 5, with a start on a 5-minute mark, it is unchanged.

**Left as it was:**
- **`production_slot` still rounds down from midnight.** A generated grid never uses it for counting: kitchen usage is keyed by the collection time itself (`production_window_key = timeMap[ct] || ct`, and `timeMap` only exists for the legacy static `collection_times` table).
- **A stale comment in `app/api/menu/[truckId]/route.ts`** still names `clockGridMinutes`. That file is fenced by the costs-accounts-1 guard, so I left its one comment line rather than open an exemption. It is not code.

## 2 · Kitchen capacity windows: how they are counted today

**They are not counted from midnight, and they are not on a fixed grid** (`lib/slot-availability.ts`):

- **The ceiling.** `kitchen_capacity` over `capacity_window_mins` is an exact sweep-line count of items in production at the same moment. It works on cooking intervals; there are no clock boxes.
- **Instant items that count** (`placeInstantPoints`) are seated in windows that end at the order's own collection time. They step back one `capacity_window_mins` at a time, never earlier than event start minus one window, and never before now.
- **Cooking categories** use the window that ends at the collection time (`slot − prep`), stepping back by prep for each extra batch.
- **The capacity window's dropdown** sets only the step length; it has no anchor of its own.

So every capacity window hangs off a collection time. Now that the collection times count from the event's start, the windows follow them automatically.

**Recommendation: no change.** Re-anchoring them separately would give them a second rule to drift from. The only clock-anchored value left is the `production_slot` label above, which counts nothing on a generated grid.

## 3 · Existing orders

**No database change.** An order keeps its saved `slot`. On an event whose start is off its interval (none upcoming today), an existing order at an old clock-anchored time behaves like this:

- **Display:** it still shows its time on its card.
- **Capacity:** it still counts. Kitchen usage is keyed by the order's own time, and the engine reads any time.
- **Placement:** a time that is not on the list is booked as requested, without a capacity check. That rule already existed (`place-in-slot.ts`, "unrecognised slot").
- **Dashboard:** it has no dot of its own, because it is not on the new grid.

**Deploy window.** A customer page left open across the deploy could still submit an old clock-anchored time. That only matters for an event whose start is off its interval; there are none today. Such an order would be booked as requested, by the same existing rule.

## 4 · Tests

**`scripts/longer-intervals-1.cjs` §2, extended.** For every interval and every start from 00:00 to 20:55 in 5-minute steps (on and off the hour; 17:00, 17:10, 19:00 and 19:45 included), it checks:
- the backup picker, `/api/slots` (before its grace times) and server placement give the same list;
- that list is start + k × interval, and begins at the start;
- every customer time sits on the operator's grid when the operator's interval divides the customer's;
- for earliest-possible times on and off the grid, the first time offered equals the first grid time at or after it (`firstGridTimeAtOrAfter`), and the picker offers exactly that.

It also checks named examples (19:00 at 45; 17:10 at 15, 30 and 45; 19:45 at 20 and 60) and source rules: every call site builds with the one function, and no midnight rounding is left. A broken variant (a midnight-anchored picker) must fail, and fails only on starts off their interval (1,148 cases).

**Results:**

| Harness | Result |
|---|---|
| `longer-intervals-1` | ✅ (re-pinned for start anchoring) |
| `slot-interval-generator` | ✅ 22. Identical to the frozen start-anchored walk at **every** interval (previously at 5 only); two broken variants fail. |
| `slot-interval-grid-routing` | ✅ (re-pinned) |
| `slot-interval-van-resolution` | ✅ (re-pinned: a 17:50 start at 15 begins at 17:50) |
| `slot-interval-settings`, `slot-interval-dots`, `slot-interval-engine-identity`, `slot-interval-van-list-tolerance` | ✅ |
| `seed-demo-grid`, `demo-seed-parameters`, `sixteen-pizza-admission`, `dot-overlap-labels`, `batch-rolling-identity`, `event-types` | ✅ |
| `language-phase-1a` / `-1b` / `-1c` / `-1d` / `-1d2` / `-2` | ✅ |
| `money-sweep-parity` (GBP and USD) | ✅ |
| `midnight-events` | ✅ 372 |
| `costs-accounts-1` | ✅ 78 |
| `cwv-2` | ✅ 44 |
| `pending-card-render`, `pending-card-buttons`, `event-types-render` | ✅ |

`tsc --noEmit` is clean.

**How the identity harnesses were re-pinned.** Each states the change precisely and fails on any other difference:
- `scripts/_named-collection-anchor.cjs`: the backup picker's five past-the-end options.
- `_midnight-customer.cjs`: the "Around" estimate on the grid.
- `_longer-intervals-order-page.cjs`, regenerated: costs-accounts-1 and cwv-2 accept the order page only if putting exactly these edits back gives the `ae7ff8b4` file.

## 5 · The full sweep

`node scripts/run-harnesses.cjs` (218 harnesses): **9 failed**. None is caused by this work:

- **5 fail on the other session's unfinished locale work.** `content/legal/ru-KZ/*.md` does not exist yet: paperwork-1, legal-languages-1, world-countries-3, contact-1 and tidy-1.
- **4 had no Next build on disk.** Something removed `.next` during the sweep: event-types-render, pending-card-render, pending-card-buttons, and midnight-events' Manage views.
  - I ran `npx next build` locally (exit 0, nothing deployed) and re-ran all four: **all pass**.
  - midnight-events' customer checks were also re-pinned for the "Around" estimate (§1).

## 6 · SQL

None was written or run against the schema. One read-only check:

```sql
with ev as (
  select e.id, e.truck_id, e.event_date, e.start_time, e.van_id,
         coalesce(e.collection_interval_mins_override, v.collection_interval_mins, 5) as cust_iv,
         coalesce(e.operator_collection_interval_mins_override, e.collection_interval_mins_override, v.operator_collection_interval_mins, v.collection_interval_mins, 5) as op_iv
  from truck_events e
  join trucks t on t.id = e.truck_id
  left join truck_vans v on v.id = e.van_id
  where e.event_date >= current_date and t.slug <> 'pizzeria-gusto'
)
select count(*) as upcoming_events,
       count(*) filter (where (extract(hour from start_time)*60 + extract(minute from start_time))::int % cust_iv <> 0
                           or (extract(hour from start_time)*60 + extract(minute from start_time))::int % op_iv <> 0) as events_grid_moves,
       (select count(*) from orders o join ev on ev.id = o.event_id
         where (extract(hour from ev.start_time)*60 + extract(minute from ev.start_time))::int % ev.cust_iv <> 0
            or (extract(hour from ev.start_time)*60 + extract(minute from ev.start_time))::int % ev.op_iv <> 0) as orders_on_those_events,
       count(*) filter (where cust_iv <> 5 or op_iv <> 5) as events_not_on_5
from ev;
-- → 18 upcoming events · 0 whose grid moves · 0 orders on such events · 4 not on 5-minute times
```

Pizzeria Gusto was not queried. If any Gusto event starts off its interval, its list would move the same way; its existing orders keep their times (§3).

## 7 · Files

**Code:**
- `lib/slot-generation.ts`
- `lib/slot-interval-core.ts` (comment)
- `lib/seed-demo-orders.ts`
- `app/(app)/trucks/[slug]/order/page.tsx`

**Harnesses:**
- `scripts/longer-intervals-1.cjs`, `scripts/slot-interval-generator.cjs`, `scripts/slot-interval-grid-routing.cjs`, `scripts/slot-interval-van-resolution.cjs`
- `scripts/_named-collection-anchor.cjs` (new), `scripts/_longer-intervals-order-page.cjs`, `scripts/_lp2-named.cjs`, `scripts/money-sweep-parity.cjs`, `scripts/_midnight-customer.cjs`
- `scripts/harnesses.json` (my helper modules registered)
- `scripts/fixtures/language-phase-2-us-changed.txt` (regenerated; names the new change)

**Manual:** `docs/reference-manual.md` V16.17 (changelog, and the canonical "Selectable collection times" passage rewritten).

**Report:** `docs/collection-anchor-1-report.md`.

The other sessions' working-tree changes were left out of the commit.

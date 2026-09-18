# Read-only trace — what updated Pizzeria Gusto's 18 September event at 08:15:33 UTC on 17 September

17 September 2026. **Read-only throughout.** No code changed, no database write, no app route called with
Gusto's token or device id during this trace. The only file written is this report.

## 0. A note on the prompt

No span arrived garbled. One apparent tension: the header says *"Change NO code, write NOTHING"* while the
closing instruction says to write `docs/gusto-event-update-trace-report.md`. I read the first as the live
system — no DB writes, no code changes — and the last as the deliverable, so this report is the only thing
written. Everything else in this trace is SQL reads, code reading and session history.

## 1. Answer first

**(b) Gusto's own use.** The event's `start_time` was changed from **17:00:00 to 16:00:00** at
2026-09-17 08:15:33.322 UTC. It was not caused by any request of mine: my session made **no request of any
kind** for 64 minutes around that moment, and the only Gusto app-route call in the entire session was a
**GET** ten hours earlier on a route that performs no writes at all.

## 2. `git status`

Unchanged by this trace — no file was touched. HEAD `fc0fddc outreach`; 32 modified, 45 untracked (the
collection-times work, the rolling fix, the durable-harness work and the wired-printing build, all
uncommitted). Full listing:

```
 M android/app/capacitor.build.gradle        M android/capacitor.settings.gradle
 M app/api/dashboard/action/route.ts         M app/api/dashboard/route.ts        M app/api/events/route.ts
 M app/api/manage/route.ts                   M app/api/menu/[truckId]/route.ts   M app/api/orders/submit/route.ts
 M app/api/slots/[truckId]/route.ts          M app/dashboard/[token]/page.tsx    M app/landing/page.tsx
 M app/manage/[token]/page.tsx               M app/trucks/[slug]/order/page.tsx  M components/dashboard/AddOrderPanel.tsx
 M components/printing/PrintingSettings.tsx  M content/store-listing.md          M ios/App/App/Info.plist
 M ios/App/CapApp-SPM/Package.swift          M lib/capacity-breach.ts            M lib/orders/place-in-slot.ts
 M lib/payments/promote-draft.ts             M lib/plan-features.ts              M lib/printing/bleTransport.ts
 M lib/printing/transport.ts                 M lib/printing/usePrinting.ts       M lib/slot-availability.ts
 M lib/slot-display.ts                       M lib/slot-generation.ts            M lib/supabase.ts
 M package-lock.json                         M package.json                      M scripts/whatsapp-golive-parity-harness.cjs
?? app/api/printing/  ?? components/printing/PrinterTypeChoice.tsx
?? docs/{batch-keep-together-investigation,batch-overlap-review,batch-rolling-durable-harness,batch-rolling-fix,
   dashboard-order-and-batch-overlap,slot-interval-build,slot-interval-event-override,slot-interval-hardening,
   slot-interval-van-level,wired-printing-build,wired-printing-followup,wired-printing-investigation}-report.md
?? lib/printing/{netAddress,netTransport,networkGuard,testTicket}.ts  ?? lib/slot-interval.ts  ?? plugins/
?? scripts/_batch-rolling-golden-generate.cjs  ?? scripts/_batch-rolling-snapshot.cjs  ?? scripts/_printing-mocks.cjs
?? scripts/_slot-interval-compile.cjs  ?? scripts/batch-rolling-check.cjs  ?? scripts/batch-rolling-identity.cjs
?? scripts/dev-virtual-printer.cjs  ?? scripts/fixtures/
?? scripts/printing-{copy,dedupe,escpos-identity,failure-split,gating,network-guard,transport-contract}.cjs
?? scripts/slot-interval-{dots,engine-identity,event-override,generator,grid-routing,settings,van-list-tolerance,van-resolution}.cjs
?? supabase/migrations/2026091{6_collection,7_van_collection,8_event_collection}_intervals.sql
?? supabase/migrations/20260919_van_network_printer.sql
```

## 3. What actually changed

I hold a **static fixture of this event captured during the batch-rolling work**, stored in
`scripts/fixtures/batch-rolling-golden.json` (`gustoLive.inputs.events_upcoming`). Comparing it with the live
row today:

| Column | My captured fixture (16 Sept, 22:0x UTC) | Live now | Changed |
|---|---|---|---|
| `truck_events.start_time` | **17:00:00** | **16:00:00** | 🔴 **yes — one hour earlier** |
| `truck_events.end_time` | 20:00:00 | 20:00:00 | no |
| `truck_events.event_date` | 2026-09-18 | 2026-09-18 | no |
| `truck_events.van_id` | ff1d59b8-… | ff1d59b8-… | no |
| `truck_events.status` | confirmed | confirmed | no |
| `truck_events.collection_interval_mins_override` | null | null | no |
| `truck_events.operator_collection_interval_mins_override` | null | null | no |

Corroborated independently by `docs/batch-rolling-fix-report.md`, which recorded the look-only check as
*"43 slots from **17:00**, interval 5"* and listed *"Gusto event 2026-09-18 **17:00–20:00**"*.

**A timestamp-precision signal that narrows the cause.** On this row:
- `created_at` = `2026-09-07T16:57:55.730379+00:00` — **six** decimals ⇒ a database default (`now()`).
- `updated_at` = `2026-09-17T08:15:33.322+00:00` — **three** decimals ⇒ JavaScript
  `new Date().toISOString()`, which emits exactly three.
- `confirmed_at` = `2026-09-07T17:02:27.923+00:00` — three decimals, also app-supplied.

So the brief's suspicion is right: `updated_at` was written by **application code**, not by the database.

## 4. Step 1 — TIMELINE: every request of mine involving Gusto

Recovered from the session transcript
(`~/.claude/projects/-Users-dominicbonini-dev-village-foodie/2c6b5a76-…jsonl`, 61,820 records,
2026-08-20 → now). Timestamps are the transcript's own, in **UTC**. Tokens redacted.

### 4a. App-route calls with Gusto's dashboard token — there is exactly ONE in the whole session

| UTC | Method | Route | Target | Writes? |
|---|---|---|---|---|
| **2026-09-16 22:16:54** | **GET** | `/api/dashboard?token=<REDACTED>&date=2026-09-18&event_id=a6c92f4b-…` | **localhost:3000** (dev server, production database via `.env.local`) | **none — see §5** |

That is the look-only check `docs/batch-rolling-fix-report.md` §5 records. It is **10 hours 0 minutes before**
the 08:15:33 write, and it is a GET.

**On 17 September I made no app-route call at all** — not to localhost, not to production, for any truck.

### 4b. Read-only PostgREST queries naming Gusto (the `q.cjs` helper — GET only, service role)

25 in total since 16 September. On the day in question:

| UTC | Query (read-only) |
|---|---|
| 2026-09-17 07:20:09 | `trucks?select=id,plan,feature_overrides,trial_expires_at&id=eq.pizzeria-gusto` |
| 2026-09-17 07:20:09 | `van_devices?select=truck_id,van_id,device_id,platform,default_screen&truck_id=in.(pizzeria-gusto,test-truck)` |
| 2026-09-17 07:29:59 | `trucks?select=id,dashboard_pin&limit=100` |
| 2026-09-17 07:36:44 | `trucks?select=plan,plan_status,feature_overrides&id=eq.pizzeria-gusto` |
| 2026-09-17 07:43:54 | `trucks?select=plan,feature_overrides,trial_expires_at&id=eq.pizzeria-gusto` |
| 2026-09-17 07:49:25 | `truck_vans?select=network_printer_address&limit=1` · `van_devices?select=van_id&truck_id=eq.pizzeria-gusto` |
| 2026-09-17 09:34:25 onwards | this trace's own reads |

**None of these touches `truck_events`, and all are GETs.** The 16 September ones read
`truck_events`/`truck_vans`/`menu_categories`/`production_slot_usage` — all `select=`.

### 4c. 🔴 The decisive gap

| | |
|---|---|
| My last session activity before the write | **2026-09-17 07:51:55.536Z** (writing `docs/wired-printing-build-report.md`) |
| **The write** | **2026-09-17 08:15:33.322Z** |
| My next session activity after the write | **2026-09-17 08:56:04.963Z** |

**A 64.2-minute window with zero session entries of any kind** — the write lands 23.6 minutes into it, and
40.5 minutes before I resumed. I was idle, waiting for the next brief. There is no request of mine to
attribute it to.

## 5. Step 2 — CODE: every path that writes `truck_events`

Every `supabase.from('truck_events')` mutation in the repository:

| # | Symbol / location | (a) Trigger | (b) Reachable by a GET I made? | (c) Columns written |
|---|---|---|---|---|
| 1 | `update_event` action — `app/api/dashboard/action/route.ts:1160` | **POST** `/api/dashboard/action`, `action: 'update_event'` with an `event_id` — the dashboard's event-times editor | **No.** POST only; requires Gusto's dashboard token. I never POSTed to it for any truck but test-truck. | `start_time`, `end_time`, **`updated_at: new Date().toISOString()`** |
| 2 | `upsert_event` (update branch) — `app/api/manage/route.ts:858` | **POST** `/api/manage`, `action: 'upsert_event'` with an `id` — Manage's event editor. Needs an **operator sign-in**, not a dashboard token | **No.** POST only, and operator-authenticated. (I hit its 401 on test-truck during the batch-rolling work.) | `venue_name`, `town`, `postcode`, `address`, `event_date`, `start_time`, `end_time`, `notes`, `latitude`, `longitude`, `van_id`, **`updated_at: new Date().toISOString()`** |
| 3 | `update` action — `app/api/events/action/route.ts:165` | **POST** `/api/events/action`, `action: 'update'`; authenticated by `getTruck(token)` against `trucks.dashboard_token` | **No.** POST only. | allow-list ∩ payload of `venue_name`, `venue_address`, `start_time`, `end_time`, `customer_note`, `auto_open`, `auto_close`, `notes`, plus **`updated_at: now`** |
| 4 | `close` — `app/api/events/action/route.ts:141` | POST `action: 'close'`, only from `status = 'open'` | No | `status`, `closed_at` — **no `updated_at`** |
| 5 | cancel / unconfirm — `app/api/events/action/route.ts:222`, `:313` | POST | No | `status`, `cancellation_note`, `updated_at` |
| 6 | `order_ready_override` — `app/api/dashboard/action/route.ts:2610` | POST | No | `order_ready_override` only — **no `updated_at`** |
| 7 | pause / extra-wait / offline patches — `app/api/dashboard/action/route.ts:2508`, `:2546`, `:2620` | POST | No | `paused_until`, `online_paused_until`, `extra_wait_mins`, `extra_wait_started_at`, `last_offline_pause_at`, `offline_no_autoaccept_until` — **no `updated_at`** |
| 8 | cancel — `app/api/manage/route.ts:962` | POST | No | `status: 'cancelled'` — no `updated_at` |
| 9 | insert — `app/api/manage/route.ts:875`, `app/api/inbound-schedule/route.ts:186` | POST / scraper ingest | No — inserts, not updates | n/a (new row) |
| 10 | deletes — `lib/provision-demo-event.ts:117`, `lib/demo-restart.ts:91` | demo provisioning only | No | n/a |
| 11 | `scripts/reresolve-event-venues.ts:50` | a script, run by hand | **Not run** — absent from the session history | venue fields |
| 12 | `increment_event_order_counter(uuid)` — RPC via `lib/order-utils.ts:23` | an order being placed | Not by a GET; and see below | `order_counter` only, inside a Postgres function — **does not set `updated_at`** |

**Only rows 1, 2, 3 and 5 write `updated_at` at all, and all four are POST actions requiring Gusto's dashboard
token or an operator session.** Row 5 is excluded because `status` is still `confirmed`. That leaves **1, 2 or
3** — every one of which is a deliberate event edit by someone signed in as Gusto.

### The routes I actually called cannot write

`app/api/dashboard/route.ts` (the GET I made) contains **zero** `.update(`, `.upsert(`, `.insert(`, `.delete(`
or `.rpc(` calls — a literal count of 0 across the whole file. The only data helper it invokes is
`getProductionSlotUnits` (line 639), whose body reads `orders` and the menu tables and writes nothing. The
writers in that module — `computeEventUnitRows`, `addOrderToProductionSlot`, `rebuildProductionSlotUsage` —
are **not imported or called** by the dashboard GET, and in any case they write `production_slot_usage`,
never `truck_events`.

The same is true of the other read routes: `app/api/slots/[truckId]/route.ts`, `app/api/events/route.ts` and
`app/api/menu/[truckId]/route.ts` each contain **zero** mutations.

There is **no auto-open / auto-close / pause-expiry / extra-wait-expiry / van-auto-assignment /
offline-clean-up / lazy-reseed path reachable from a GET that writes `truck_events`.** (The one
auto-van-assignment that exists, using `getSoleActiveVanId`, sits inside `/api/events/action` — a POST — and
would have written `van_id`, which is unchanged.)

## 6. Step 3 — is there a database trigger on `truck_events`?

**No.** The intended query is:

```sql
select triggers.trigger_name,
       triggers.event_manipulation,
       triggers.action_timing,
       triggers.action_statement
from information_schema.triggers as triggers
where triggers.event_object_schema = 'public'
  and triggers.event_object_table = 'truck_events';
```

I could not execute it: PostgREST does not expose `information_schema` (the attempt returned `PGRST202`), and
the session's read-only helper is PostgREST-only. **Two independent lines of evidence answer it anyway:**

1. **The migrations.** A repository-wide search for `create trigger` / `create or replace trigger` across
   `supabase/migrations` returns **exactly one** result:
   `supabase/migrations/20260703_orders_updated_at_trigger.sql:32: create trigger orders_set_updated_at` —
   on `public.orders`, not `truck_events`. There is no `moddatetime`, `set_updated_at` or
   `handle_updated_at` anywhere else.
2. **The data disproves a trigger.** `truck_events.order_counter` for this event is **2**, and the two
   increments came from orders created at **08:21:36** and **09:30:48** — both *after* 08:15:33. If any
   `BEFORE UPDATE` trigger set `updated_at`, those two `UPDATE`s (via `increment_event_order_counter`) would
   have pushed `updated_at` to 09:30:48. It is still 08:15:33. **Therefore no trigger maintains this column**,
   and `updated_at` is written only where application code sets it explicitly.

This matters: it means the 08:15:33 timestamp is not incidental. It is the moment one of the three
event-editing POSTs ran.

## 7. Step 4 — the event's full row (read-only)

```sql
select truck_events.*
from public.truck_events
where truck_events.id = 'a6c92f4b-649c-43e7-9a3a-6da7993cdffd';
```

Every column the §5 paths could have written:

| Column | Value | Matches which path? |
|---|---|---|
| `truck_events.start_time` | **16:00:00** (was 17:00:00) | 🔴 the change — paths 1, 2 or 3 |
| `truck_events.end_time` | 20:00:00 (unchanged) | consistent: paths 1/2 rewrite it to the same value |
| `truck_events.updated_at` | **2026-09-17T08:15:33.322+00:00** | paths 1, 2, 3 (all set it explicitly) |
| `truck_events.status` | `confirmed` | rules out cancel / unconfirm / close |
| `truck_events.opened_at` / `closed_at` | null / null | rules out open / close |
| `truck_events.confirmed_at` | 2026-09-07T17:02:27.923+00:00 | untouched since 7 Sept |
| `truck_events.van_id` | ff1d59b8-… (unchanged) | no van auto-assignment ran |
| `truck_events.auto_open` / `auto_close` | true / true | unchanged |
| `truck_events.paused_until` | null | rules out the pause path |
| `truck_events.online_paused_until` | null | rules out the online-pause path |
| `truck_events.extra_wait_mins` / `extra_wait_started_at` | null / null | rules out extra-wait |
| `truck_events.last_offline_pause_at` | null | rules out offline-protection clean-up |
| `truck_events.offline_no_autoaccept_until` | null | rules out offline auto-accept expiry |
| `truck_events.order_counter` | **2** | the two orders below; written by RPC, no `updated_at` |
| `truck_events.collection_interval_mins_override` | null | untouched by the collection-times work |
| `truck_events.operator_collection_interval_mins_override` | null | untouched |
| `truck_events.venue_name` / `town` / `postcode` | Wickhambrook MSC / Wickhambrook / CB8 8YN | unchanged vs the scraper's signature |
| `truck_events.source` / `scraped_signature` | scraper / "Wickhambrook MSC" | created by the scraper on 7 Sept |

And the orders on that event:

```sql
select orders.id, orders.event_id, orders.slot, orders.source, orders.created_at, orders.status
from public.orders
where orders.truck_id = 'pizzeria-gusto'
order by orders.created_at desc
limit 5;
```

| id | slot | source | created_at (UTC) | status |
|---|---|---|---|---|
| 2 | 17:30 | manual | **2026-09-17T09:30:48.907496** | confirmed |
| 1 | 19:15 | manual | **2026-09-17T08:21:36.577624** | confirmed |
| 30 | 20:05 | manual | 2026-09-04T18:54:40 | collected |

Both of today's orders are on **this** event, both `source: 'manual'` (an operator typing them into the
dashboard), and both land **6 minutes and 75 minutes after** the 08:15:33 write. `order_counter = 2` matches
exactly.

## 8. Step 5 — CONCLUSION

### (b) — caused by Gusto's own use, on production.

**The evidence, in order of strength:**

1. **I made no request at that time.** My session was silent for 64.2 minutes spanning the write
   (07:51:55Z → 08:56:05Z). There is no candidate request to attribute it to.
2. **My only Gusto app-route call was a GET, ten hours earlier**, and that route performs zero writes — a
   literal count of 0 mutations in `app/api/dashboard/route.ts`, and its one helper is read-only. Even if the
   timing had been close, a GET of `/api/dashboard` cannot write `truck_events`.
3. **`updated_at` on this table is only ever set by explicit application code** (no trigger — §6), and only
   by three POST actions: `update_event` (dashboard), `upsert_event` (Manage), `events/action update`. All
   three require Gusto's dashboard token or an operator sign-in as Gusto. I used neither, at any point, for
   any write: every Gusto request of mine in the whole session was a GET.
4. **The change is a deliberate edit, not a side effect.** `start_time` moved a clean hour, 17:00 → 16:00,
   with `end_time`, `van_id`, `status`, `confirmed_at` and every venue field untouched. No automatic path
   produces that; the pause, extra-wait, offline and auto-open columns are all still null, ruling each out.
5. **It sits inside a burst of genuine trading activity on that same event**: two manual orders, 6 and 75
   minutes later, taking `order_counter` to 2. Someone was working on tomorrow's event in the app.

**Nothing was written by me, so there is nothing of mine that changed what Gusto or its customers see.** For
completeness: had my GET somehow written, the visible effect of this particular change would be that
tomorrow's collection slots start at 16:00 instead of 17:00 — twelve extra 5-minute slots offered to
customers. That is the operator's decision, correctly recorded, and it is consistent with the two orders
taken straight afterwards.

## 9. Anything I could not establish

- **Which of the three surfaces made the edit** — `update_event` (the dashboard's event-times box),
  `upsert_event` (Manage), or `events/action update`. All three write `start_time` + `updated_at`, and the
  resulting row is identical whichever ran. Distinguishing them needs Vercel/production request logs, which I
  have no read access to and did not attempt to reach. `end_time` being rewritten to its existing value is
  consistent with all three, so it does not discriminate.
- **The exact person and device.** `truck_events` records no actor. The dashboard-token routes do not write
  an audit row for this action, so the row cannot name who made the change.
- **The trigger question by direct query.** `information_schema` is not reachable through PostgREST
  (`PGRST202`). I answered it from the migration set plus the `order_counter` evidence in §6, which I regard
  as conclusive, but it is inference rather than a direct catalogue read. A psql session would settle it in
  one query.
- **Whether my local dev server was still running at 08:15:33.** It points at the production database, so in
  principle a request to `localhost:3000` could write to production. I can state that **I issued none** — the
  transcript shows no tool call of any kind in that 64-minute window — but I cannot prove no other process on
  this machine contacted it. This does not affect the conclusion: the write requires a deliberate POST with
  Gusto's credentials, whichever host served it.
- **The precise moment the fixture was captured** relative to the change: my capture reads 17:00 and is dated
  by the session at 2026-09-16 22:0x UTC, so the change occurred between then and 08:15:33 on 17 September —
  `updated_at` pins it to the latter.

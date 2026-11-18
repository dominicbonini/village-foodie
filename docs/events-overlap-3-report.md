# events-overlap-3: your answers applied, the live checks, and your click-through

**17 Nov 2026. All five answers are done.**
- **The live checks pass: 35 out of 35** against the shared database, through the app on localhost, on test-truck only.
- **The offline checks pass:** 24 rule checks, 46 route checks and 7 offline-queue checks.
- **The test data is in place for your click-through** (§2).
- **Git:** one local commit, `cf8ff324` (the migration only). Nothing pushed, nothing deployed, everything else uncommitted.

## Q1: the migration (committed alone, then run)
- **Commit:** `cf8ff324` "events-overlap-2: truck_events.overlap_dismissed_at (nullable) — migration only".
  - It holds that one file and nothing else; the staged area held only it.
  - It is on `main`, local. I did not make a branch, because this checkout is shared with your other sessions: the languages job committed `35a691ed` just before it. Switching branches would have moved their work too.
- **Run:** `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261117_truck_events_overlap_dismissed.sql`
  ```
  db-migrate: … · sha256 ff7a24171e9955aa · committed at cf8ff324
  db-migrate: … applied — one transaction, no error
  ```
  The usual warning that marketing pages weren't told (`REVALIDATE_SECRET` not set) is unrelated.
- **The SQL:**
  ```sql
  alter table public.truck_events add column if not exists overlap_dismissed_at timestamptz;
  comment on column public.truck_events.overlap_dismissed_at is 'events-overlap-2: when staff chose to keep the overlapping approved event instead of approving this one. Null = never asked or never dismissed.';
  ```
- **Checked afterwards (read-only):** `overlap_dismissed_at` · timestamp with time zone · nullable · no default · comment present.

## Q2: test data (scripts, not migrations)

Three scripts in [scripts/dev/](../scripts/dev/), all uncommitted. Each starts with the repo's `--yes-write-to-production` guard as its first statement, and connects the way `db-migrate.cjs` does: `SUPABASE_DB_URL` read from `.env.local` by the script alone, never printed.
- [events-overlap-testdata.cjs](../scripts/dev/events-overlap-testdata.cjs) creates the rows in one transaction and records every id.
- [events-overlap-testdata-delete.cjs](../scripts/dev/events-overlap-testdata-delete.cjs) deletes exactly the recorded ids.
- [events-overlap-livecheck.cjs](../scripts/dev/events-overlap-livecheck.cjs) runs the live checks (Q4).

**The record:** `scripts/dev/events-overlap-testdata.local.json`, git-ignored by a new `.gitignore` line, `scripts/dev/*.local.json`.

### What is in place now (test-truck, Pizza Kitchen)

| Key | Date | Event | Status now | Orders | Purpose |
|---|---|---|---|---|---|
| **A** | **today 17 Nov** | Harnessville Sports Club, 12:00–23:00, Van1 | confirmed, **never started** | 3 online + 1 cancelled | your click-through |
| **B** | today | HSC, 12:00–23:00, no van | **unconfirmed** | 0 | your click-through ("Keep") |
| **D** | today | Harnessville SC, 12:00–23:00, no van | **unconfirmed** | 0 | your click-through ("Approve anyway") |
| **C** | tomorrow 18 Nov | Market Square, 11:30–14:00, Van1 | confirmed | 0 | your click-through (no overlap, switch target) |
| CL | 19 Nov | EO2 check Live, 12:00–20:00 | confirmed | 5 (1 test + 4 from checks) | live checks |
| CO | 19 Nov | EO2 check Other, 12:00–20:00 | **finished** (opened and closed by checks) | 3 (checks) | live checks |
| CD | 19 Nov | EO2 check Dup, 12:00–20:00 | unconfirmed, **"Keep" already chosen** | 0 | live checks |
| CX | 19 Nov | EO2 check Cancelled | cancelled | 0 | live checks |
| CS | 19 Nov | EO2 check Start, 21:00–23:00 | **finished** | 1 (check) | live checks |
| CU | 20 Nov | EO2 check Lone, 12:00–20:00 | unconfirmed | 0 | live checks |

**10 events and 13 orders are recorded.** All are on test-truck, checked by the delete script's dry run ("would delete 13 orders and 10 events on test-truck"). A, B and C are exactly as created: A is not started, B and D have nothing dismissed, and A has 3 orders that aren't cancelled.

### Deleting it, after your click-through (approved by you; not run yet)
1. If you placed any orders during the click-through, add them to the record first. This is read-only, and it lists what it adds:
   ```
   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --rescan
   ```
2. Then the delete:
   ```
   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --approved-by-dominic
   ```

**It deletes the recorded orders, then the recorded events, in one transaction.** The events' slot-usage, deal, stock and weather rows go with them by `ON DELETE CASCADE`.

**It refuses, and changes nothing, if:**
- any recorded row belongs to another truck;
- an order that isn't in the record sits on a recorded event (it tells you to run `--rescan`);
- the number of deleted rows differs from the record.

Both refusals without flags were checked: no flag → "WRITES to production"; no approval → "the delete needs --approved-by-dominic".

**What it does NOT delete:** any `action_audit_log` lines the app wrote for these test orders. They are log rows keyed by order, with no foreign key.

## Q3: customer submit ([app/api/orders/submit/route.ts](../app/api/orders/submit/route.ts))

**One decision now picks the order's event** (~line 373), and pause, pricing and the order row all read it:
1. **The event the customer ordered from (`eventId`)**, if it is this truck's and confirmed or open.
2. **Otherwise, the date's confirmed/open events:** the **open** one (most orders if several), else the **confirmed one with the most orders** (ties: earliest start, then id).
3. **Never** an unconfirmed, closed or cancelled event. **Refused only when nothing confirmed/open matches**, with the existing `event_not_available` message. No new words and no screen change.

**What went:**
- The `.maybeSingle()` date lookup that skipped the status guard when two events matched.
- "Earliest by start_time, any status".
- Pricing's separate lookup and its ambiguous-date refusal ("decision 7"). Pricing now uses the same event, so that refusal can't be reached; it is left in place but marked as such.

**Changed for one case:** an order for a date with **no event at all** used to be stored with no event. It is now refused with `event_not_available`. No order in the last 120 days had a null event (checked read-only).

**Route checks** (in-memory Postgres stand-in, real route code), 9 cases, all pass:
- `eventId` names a confirmed event → it.
- `eventId` names the unconfirmed duplicate → the confirmed event.
- No `eventId`, two confirmed → the one with the most orders (5 vs 1).
- Open plus a busier confirmed → the open one.
- Only an unconfirmed event → 403.
- Cancelled, nothing else → 403.
- Cancelled plus a confirmed → the confirmed one.
- Only closed plus unconfirmed → 403.
- No event at all → 403.

## Q5: walk-ups on finished events allowed again
[app/api/dashboard/action/route.ts ~1335](../app/api/dashboard/action/route.ts): walk-ups go on **confirmed, open and closed** events, as before.

**Live requests:**
- **unconfirmed** → 409 `event_not_approved` (the dashboard opens its approve question);
- **cancelled** → 409 `event_not_open` ("This event was cancelled.").

**Offline replay, same rule:**
- unconfirmed → moved onto the overlapping approved/started event (most orders), or kept queued (`keep_queued`) when nothing overlaps;
- cancelled → 409 without `keep_queued`, so the outbox flags a conflict, kept on the device;
- closed → accepted.

*(The "has finished. Restart it…" branch of `errorsKitchen.event_not_open` is now unused. It is left in place rather than rewriting 49 files for a branch that never shows.)*

## Q4: live checks, 35 out of 35 pass

`next dev` ran on localhost against the shared database, on the check set only (CL CO CD CX CS CU). The script reads test-truck's token itself.

**Open / close, an error with the current status (8):**
- open unconfirmed CD → 409 "not approved", row unchanged;
- close confirmed CS → 409 "not started";
- open CS → 200, now open with `opened_at`;
- open again → 409 "already started";
- close → 200;
- close again → 409 "already finished";
- open cancelled CX → 409.

**Walk-ups (6):**
- unconfirmed CD → 409 "This event isn't approved", nothing inserted;
- cancelled CX → 409, nothing inserted;
- confirmed CL → 200, on CL;
- **closed CS → 200, on CS**.

**Offline replay (5):**
- **a replay for CD → 200, the order landed on CL** (overlapping, most orders), nothing on CD;
- a replay for lone CU → 409 with `keep_queued: true`, nothing inserted;
- a replay for cancelled CX → 409 without `keep_queued`.

**Submit (Q3), 9 passed on the second run.**
- The first run's 6 submit calls were refused *before* any event logic, because I sent no customer email ("Missing required fields"). Nothing was placed. The re-run used a reserved, undeliverable address, `eo2-check@example.test`.
- After the first run, CO was **open** (an event can't go back to confirmed), so the re-run's expectations follow that:
  - `eventId` CL → on CL;
  - no `eventId` → on **CO** (open beats the busier confirmed CL);
  - `eventId` CD (unconfirmed) → CO;
  - `eventId` CX (cancelled) → CO;
  - then CO finished → `eventId` CD → **CL** (a finished event is never chosen for a customer);
  - `eventId` CU, nothing confirmed/open that date → **403 `event_not_available`**;
  - nothing ever on CD, CX or CU.
- The "two confirmed → most orders" case is covered by the route checks, not live.

**"Keep" persists (5):**
- `dismiss_overlap` on CD → 200, and `overlap_dismissed_at` is set in the database;
- again → 200, same stored time;
- CD is still unconfirmed;
- dismissing on approved CL → 409;
- no other truck has the column set.

## Your click-through on localhost (Pizza Kitchen)

Run `npm run dev`, sign in, and open Pizza Kitchen's dashboard. The times assume today, 17 Nov, after 12:00; A runs until 23:00. Do the steps in this order: B is for "Keep" and D for "Approve anyway", because after "Keep" B never shows the overlap question again.

1. **Default event.** The bar shows **📍 Harnessville Sports Club · 12:00–23:00 · Not started**. It is never HSC or Harnessville SC.
2. **The list.** Go to Add order → **Change** (on a phone: tap the 📍 line, or Manage event ▾ → Change event). You should see:
   - Harnessville Sports Club · Today 12:00–23:00 · **3 orders** (the cancelled one isn't counted);
   - Market Square · Tomorrow 11:30–14:00 · **No orders**;
   - the EO2 check events for 19 Nov (Live · 5 orders; Other and Start · Finished);
   - then a **NEEDS APPROVAL** heading: **HSC · No orders · possible duplicate**, **Harnessville SC · No orders · possible duplicate**, **EO2 check Dup · possible duplicate**, and **EO2 check Lone** (no tag).
3. **Overlap question.** Tap **HSC**: "**Approve HSC?** It's at the same time as Harnessville Sports Club (12:00–23:00), which is already approved and has 3 orders. It's probably a duplicate." The buttons are **Keep Harnessville Sports Club** (orange) and **Approve HSC anyway**.
4. Tap **Keep Harnessville Sports Club**. The question closes, HSC stays under Needs approval, and the bar still shows Harnessville Sports Club.
5. **Once only.** Tap **HSC** again: now only the plain question, "**HSC isn't approved yet. Approve it to take orders? Customers will see it too.**" with Approve / Cancel. Tap **Cancel**.
6. **Second browser.** In another browser or a private window, sign in, open the same dashboard and tap **HSC**. You get the plain question again, never the overlap one. Cancel.
7. **Approve anyway.** Tap **Harnessville SC**. You get the overlap question; tap **Approve Harnessville SC anyway**.
   - You should see: toast "**Event approved**", the bar switches to Harnessville SC, and the row moves out of Needs approval.
   - (Customers would now see both events. That's fine on test-truck.)
8. **Start, once only.** Pick **Harnessville Sports Club** again in the list, then **Manage event ▾ → Start event**.
   - You should see: "**Start this event?** Harnessville Sports Club / Today · 12:00–23:00 · 3 orders so far" with **Start event** / Cancel.
   - Tap **Start event**: toast "Event started", and the bar says **● Live**.
   - Then **Finish event**, then **Restart event**: no "Start this event?" question this time.
9. **Switch question.** With Harnessville Sports Club **Live** and selected, go to Add order → Change → **Market Square**: "**Switch to Market Square?**" with Switch / Cancel. Cancel keeps Harnessville Sports Club; Switch moves to Market Square. Choosing from a non-started event asks nothing.
10. **Phone line.** Narrow the window below 640 px, or use a phone, then open Add order. The top line is **📍 Harnessville Sports Club · 12:00–23:00** (the event's name and times); tapping it opens the list.
11. **When done:** tell me, and I'll run the `--rescan` and then the delete in §2.

*Not reachable with this data:* the "Approve an event to take orders" line, which needs today's only events to be unapproved. A is approved. It is covered by the rule checks and shown in the events-overlap-2 report.

## Checks run this round (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Rule checks (unchanged code) | 24 out of 24 |
| Route checks (Q3 submit added, Q5 updated) | **46 out of 46** |
| Offline queue | 7 out of 7 |
| `split-messages --check` | in step (no message changes this round) |
| Live, through localhost on test-truck | **35 out of 35** (26 + 9) |

- The ESLint finding on my changed lines in submit (`eventCols` unused) is fixed.
- The dev server I started for the live checks has been stopped.

## Other notes
- **fil-PH and the other incoming languages** from the languages job will need these 21 keys when they become full languages. All 48 current ones have them. It's noted in memory beside the pricing-copy keys.
- **Customer submit emails:** the 5 live submit orders tried to email `eo2-check@example.test`. `.test` is reserved, so nothing can be delivered.

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- I read "Run [the delete] when testing is finished" together with "Leave the test data in place until I've done the click-through" as one instruction. **The delete has not run.**
- **Q2's "if the repo truly has no way to write except migrations, STOP":** it has one. Repo scripts already connect themselves (e.g. `scripts/partners-add.cjs`, `scripts/db-migrate.cjs`), so I followed that pattern; no test data is in `supabase/migrations`.
- **One step added for your click-through:** a second duplicate, D, so that both "Keep" and "Approve anyway" can be tried. It was added with `--append`, recorded like the rest, and is deleted with it.

## SQL (every statement this round)

**Writes:**
```sql
-- the migration (cf8ff324), run by scripts/db-migrate.cjs
alter table public.truck_events add column if not exists overlap_dismissed_at timestamptz;
comment on column public.truck_events.overlap_dismissed_at is 'events-overlap-2: when staff chose to keep the overlapping approved event instead of approving this one. Null = never asked or never dismissed.';

-- scripts/dev/events-overlap-testdata.cjs (one transaction; truck fixed to test-truck)
select id, (now() at time zone 'Europe/London')::date as today,
  (select id from truck_vans where truck_id = $1 and active order by created_at limit 1) as van_id
from trucks where id = $1;
insert into truck_events (truck_id, venue_name, town, postcode, event_date, start_time, end_time, status, source, van_id,
  auto_open, auto_close, confirmed_at, scraped_signature, order_counter, notes)
values ($1, $2, 'Harnessville', $3, ((now() at time zone 'Europe/London')::date + $4::int), $5::time, $6::time, $7, $8, $9,
  false, true, case when $7 in ('confirmed', 'cancelled') then now() end, case when $8 = 'scraper' then $2 end, $10, 'events-overlap-2 test data')
returning id, truck_id, event_date, status;
insert into orders (id, truck_id, event_id, event_date, customer_name, items, subtotal, total, total_minor, currency, country,
  status, source, slot, van_id, payment_status, notes)
values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7, $8, 'GBP', 'GB', $9, 'web', $10, $11, 'unpaid', 'events-overlap-2 test data')
returning order_key, truck_id, event_id;
```

**The delete script (only the dry run has been run):**
```sql
select 'event' as kind, id::text as id, truck_id from truck_events where id = any($1::uuid[]) and truck_id <> $3
union all
select 'order', order_key::text, truck_id from orders where order_key = any($2::uuid[]) and truck_id <> $3;
select order_key::text, truck_id, event_id::text, id, customer_name, status, source, created_at
from orders where event_id = any($1::uuid[]) and not (order_key = any($2::uuid[])) order by created_at;
-- with --approved-by-dominic only:
delete from orders where order_key = any($1::uuid[]) and truck_id = $2 returning order_key;
delete from truck_events where id = any($1::uuid[]) and truck_id = $2 returning id;
```

**Reads by the live-check script:**
```sql
select dashboard_token, slug from trucks where id = $1;
select status, opened_at, closed_at, overlap_dismissed_at from truck_events where id = $1 and truck_id = $2;
select order_key::text, event_id::text, source, status from orders where event_id = $1 and truck_id = $2;
select order_key::text, event_id::text, source, truck_id from orders where order_key = $1;
select count(*)::int n from truck_events where overlap_dismissed_at is not null and truck_id <> $1;
select order_key::text, event_id::text, id, customer_name, status, source, truck_id from orders where event_id = any($1::uuid[]) order by created_at;
```
Its writes went through the app's own routes (events/action, dashboard/action `manual`, orders/submit), not SQL.

**Read-only (Supabase MCP):**
```sql
select source, count(*) n, max(created_at) last_at, count(distinct truck_id) trucks from orders where event_id is null and created_at > now() - interval '120 days' group by source order by source;
select column_name, data_type, is_nullable, column_default, col_description('public.truck_events'::regclass, ordinal_position) as comment from information_schema.columns where table_schema='public' and table_name='truck_events' and column_name='overlap_dismissed_at';
select now() at time zone 'Europe/London' as london_now, (select json_agg(json_build_object('id',id,'date',event_date,'start',start_time,'end',end_time,'status',status,'venue',venue_name,'van',van_id) order by event_date, start_time) from truck_events where truck_id='test-truck' and event_date between current_date - 1 and current_date + 3 and status<>'cancelled') as events, (select json_agg(json_build_object('id',id,'name',name,'active',active)) from truck_vans where truck_id='test-truck') as vans, (select json_build_object('default_auto_open',default_auto_open,'default_auto_close',default_auto_close,'auto_accept',auto_accept,'contact_email_set',contact_email is not null,'order_email',truck_order_email_enabled,'timezone',timezone,'slug',slug) from trucks where id='test-truck') as truck;
select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='orders' and is_nullable='NO' order by ordinal_position;
select c.conrelid::regclass as tbl, a.attname as col, c.confrelid::regclass as ref, c.confdeltype as on_delete from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey) where c.contype='f' and c.confrelid in ('public.truck_events'::regclass,'public.orders'::regclass) order by 3,1;
select name, price from menu_items_db where truck_id='test-truck' and coalesce(is_available,true) order by name limit 5;
select preorders_enabled, preorder_deadline_type, preorder_deadline_value, preorder_open_rule, time_selection_enabled, plan from trucks where id='test-truck';
select e.venue_name, e.event_date, e.start_time, e.end_time, e.status, e.opened_at is not null as started, e.overlap_dismissed_at, e.van_id is not null as has_van, (select count(*) from orders o where o.event_id=e.id and o.status<>'cancelled') as orders_not_cancelled, (select count(*) from orders o where o.event_id=e.id) as orders_all from truck_events e where e.truck_id='test-truck' and e.notes='events-overlap-2 test data' order by e.event_date, e.venue_name;
```
(One read failed on a column name, `menu_items_db.available`, and was rerun with `is_available`.)

## Git state
- `cf8ff324`: the migration alone, local, not pushed.
- **Uncommitted:**
  - the app changes from events-overlap-2 and this round;
  - 49 `messages/*.json` files plus the generated catalogue;
  - `.gitignore`;
  - `scripts/_messages-parity-1e.cjs`;
  - `scripts/dev/` (4 files);
  - `docs/events-overlap-1/2/3` reports and screenshots.

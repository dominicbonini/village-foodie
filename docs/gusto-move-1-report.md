# gusto-move-1 — tonight's staff orders moved onto Gusto's live event

**Done at 18:02:48 UTC on 13 Nov 2026, approved by Dominic in chat (option A).**

- All **23** staff orders moved from FROM (`3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6`) to TO (`b2a73e87-3bf5-42fe-a75b-633107dc374d`).
- **6** were renumbered, because their numbers were already used by online orders.
- **Nothing was left behind.**
- TO now holds all 29 orders. Its next order number is **#30**.

## The six renumbered orders (tell the truck)

| Paper ticket | Now on screen | Customer | Status | Slot | Online order that keeps the old number |
|---|---|---|---|---|---|
| #1 | **#24** | Darren | **waiting**: "modified", unpaid £20.00 | 19:15 | #1 Jo Mitchell |
| #2 | **#25** | robert | **collected**, paid £12.00 | 17:30 | #2 George willis |
| #3 | **#26** | tash | **waiting**: confirmed, unpaid £24.00 | 18:30 | #3 Carol |
| #4 | **#27** | mark | **collected**, paid £23.50 | 17:45 | #4 Brenna Greer |
| #5 | **#28** | molly | **waiting**: confirmed, unpaid £44.00 | 17:55 | #5 Rosie |
| #6 | **#29** | Oli | **waiting**: confirmed, unpaid £31.00 | 18:05 | #6 Elizabeth Budden |

None of the six is marked "ready".

The full record, with the old and new number for every moved order, is in [docs/gusto-move-1/record.md](gusto-move-1/record.md).

## Likely duplicate orders (asked after the move; read-only, nothing changed)

I compared all 29 orders now on the live event by items, total, slot and timing. Customer names were no help: none is repeated across the 29.

| How likely | Orders | Why |
|---|---|---|
| **Likely** | **#6 Elizabeth Budden** (online) and **#20 "Walk-up"** (staff) | Identical order: 1 Inferno Delight + 1 Pepperoni, £25.00. Slots 17:05 and 17:10. Created 10 minutes apart (16:57 online, 17:07 staff). **Both collected and both paid £25.** If it is one customer, they may have paid twice. |
| Possible | **#13 Dave** and **#18 Hinz** (both staff) | Same slot, 18:25, and same £19.50, both one pizza plus a Tiramisu. Different pizzas: Inferno Delight vs Buscaiola. Could be a re-entry with a changed pizza. Both still waiting. |
| Unlikely | #3 Carol (online, 18:00, £37) and #8 andreea £6 (staff, 18:10, £36) | Both have Campagnola + Ham & Shroom. Carol adds 2 Tiramisu, andreea adds a Honey Goat. |
| Unlikely | #2 George willis (online, 18:15, £36) and #9 louis (staff, 18:15, £29.50) | Same slot, and both have Cannoli + Focaccia. The other items differ. |
| Unlikely | #7 Zoe (17:00, collected) and #24 Darren (19:15, waiting) | Both 2 Margherita, £20, but slots 2¼ hours apart. Darren's was entered the day before. |
| Unlikely | #10 Toni (17:05) and #16 Rhea (18:10) | Both a single Pepperoni at £12. That is a common order. |

Duplicates also count twice in the kitchen-capacity figures. Nothing has been cancelled or changed. That is a decision for the truck.

## What was done

**Backup** at 18:00:31 UTC, to [docs/gusto-move-1/backup.json](gusto-move-1/backup.json). It holds:
- both event rows, including their order counters;
- all 29 orders on both events. Each order row includes every column the move could change, plus its identity, status, payment, slot and timestamps. Items, phone and email were not touched and are left out.
- all 16 kitchen-capacity rows on both events.

**Move**: migration [supabase/migrations/20261102_gusto_move_1.sql](../supabase/migrations/20261102_gusto_move_1.sql), committed as `78f9d77c`. I ran it with `scripts/db-migrate.cjs --approved-by-dominic` as one transaction.
1. Checked that both events are Gusto's and dated 13 Nov.
2. **Locked both event rows** (`SELECT … FOR UPDATE`). New order numbers come from `truck_events.order_counter`, so this lock makes every new online or staff order wait until the move commits. An order that was already being placed finishes before the lock is granted.
3. **Re-read the highest number under the lock.** That was the larger of TO's highest order, FROM's highest order and TO's counter: 23. Nothing had arrived on TO since the checks.
4. Renumbered only the FROM orders whose number exists on TO, lowest first: #1–#6 became #24–#29.
5. Changed `event_id` from FROM to TO on all 23 FROM orders.
6. Set TO's `order_counter` to 29.
7. **Kitchen capacity**: added FROM's units into TO's per slot and category, then removed FROM's rows. Three slots overlapped and were summed:
   - 18:05: pizza 3 + 1 = 4
   - 18:15: pizza 2 + 3 = 5, desserts 2 + 1 = 3
   - 19:00: pizza 3 + 1 = 4, plus dips 1

   This matches what the app rebuilds from the orders on its own, because capacity is a cache recalculated from an event's orders whenever an order is placed or changes status.
8. Checked inside the transaction that FROM has 0 orders, TO has FROM plus TO, the moved count equals FROM's count, and TO's counter is at least TO's highest number.

**Runner output:**
```
notice: gusto-move-1: under lock — FROM 23 orders, TO 6 orders
notice: gusto-move-1: RENUMBERED #1 -> #24 | Darren | modified
notice: gusto-move-1: RENUMBERED #2 -> #25 | robert | collected
notice: gusto-move-1: RENUMBERED #3 -> #26 | tash | confirmed
notice: gusto-move-1: RENUMBERED #4 -> #27 | mark | collected
notice: gusto-move-1: RENUMBERED #5 -> #28 | molly | confirmed
notice: gusto-move-1: RENUMBERED #6 -> #29 | Oli | confirmed
notice: gusto-move-1: DONE — moved 23 orders; TO now 29 orders; TO counter 29
db-migrate: supabase/migrations/20261102_gusto_move_1.sql applied — one transaction, no error
```
The runner also printed a warning that the marketing-page refresh wasn't sent (`REVALIDATE_SECRET` not set). That has nothing to do with this move.

## Verification (read-only, after the move)

| Check | Backup (before) | After |
|---|---|---|
| Orders on FROM | 23 | **0** |
| Orders on TO | 6 | **29** |
| Sum of order totals (both events) | £760.00 | **£760.00** on TO |
| Sum paid (both events) | £307.50 | **£307.50** on TO |
| Order numbers used twice on TO | — | **0** |
| TO order counter | 6 | **29** |
| Capacity rows on FROM | 12 | **0** |
| Capacity rows on TO | 4 | **13** (sums above) |

**The dashboard's own selection.** I reran the dashboard's query from [app/api/dashboard/route.ts:347-367](../app/api/dashboard/route.ts#L347-L367) for TO's van: `truck_id = gusto`, `event_id = TO`, status in the active or done list, and van = ff1d59b8 or no van. It returns **all 29**:
- **Active (18):** 2, 3, 4, 5, 8, 9, 11, 13, 15, 16, 18, 19, 21, 22, 24, 26, 28, 29
- **Done (11):** 1, 6, 7, 10, 12, 14, 17, 20, 23, 25, 27

**What did not change**
- Status, payment status, amount paid, totals, slots, items, created/paid/collected times and Stripe data on every order.
- The FROM event row: still "unconfirmed", no van, counter 23.

**What did change beyond event_id**
- `updated_at` on the 23 moved orders is now 18:02:48. The orders table's update trigger stamps it on every update. The old values are in the backup.

## For the truck

- Screens and devices that had **FROM** open now show an empty event. Staff should switch to the live event (17:00–20:00, the one with the van).
- **New staff orders should go on the live event.** If staff keep adding orders on FROM, those start at #24 there. They don't clash on FROM, but they would clash if moved again.
- Paper tickets for Darren, robert, tash, mark, molly and Oli show #1–#6, but the screen shows #24–#29. Use the table above.

## Prompt check

- Nothing arrived garbled.
- The earlier "do NOT renumber" was replaced by Dominic's explicit choice of option A in this chat.
- No other instruction conflicted.

## SQL (all statements this session)

**Write.** The migration file, run once:
```sql
-- see supabase/migrations/20261102_gusto_move_1.sql (committed 78f9d77c) — full text shown in chat
```

**Read-only, via the Supabase MCP:**
```sql
select tgrelid::regclass tbl, tgname, tgenabled, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal and tgrelid in ('public.orders'::regclass,'public.production_slot_usage'::regclass,'public.truck_events'::regclass);
select e.id, e.order_counter, (select max(id::int) from orders o where o.event_id=e.id) max_no, (select count(*) from orders o where o.event_id=e.id) n, now() from truck_events e where id in ('3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6','b2a73e87-3bf5-42fe-a75b-633107dc374d');
select pg_get_functiondef('public.set_orders_updated_at'::regproc) def;
-- backup snapshot (json_build_object of events / orders / production_slot_usage) — full text in chat
select e.id, e.order_counter, (select count(*) from orders o where o.event_id=e.id) n, (select sum(total) from orders o where o.event_id=e.id) total_sum, (select sum(coalesce(amount_paid,0)) from orders o where o.event_id=e.id) paid_sum, (select count(*) from (select id from orders o where o.event_id=e.id group by id having count(*)>1) d) dup_numbers, now() from truck_events e where id in ('3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6','b2a73e87-3bf5-42fe-a75b-633107dc374d');
select id, customer_name, status, payment_status, amount_paid, total, slot, source, created_at, updated_at, paid_at, collected_at, order_key from orders where event_id='b2a73e87-3bf5-42fe-a75b-633107dc374d' order by id::int;
select event_id, production_slot, units_by_cat, updated_at from production_slot_usage where event_id in ('3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6','b2a73e87-3bf5-42fe-a75b-633107dc374d') order by event_id, production_slot;
select case when status in ('pending','confirmed','modified','cooking','ready') then 'active' when status in ('collected','rejected','cancelled') then 'done' else 'NOT SHOWN' end as board, count(*), string_agg(id, ',' order by id::int) nos from orders where truck_id='pizzeria-gusto' and event_id='b2a73e87-3bf5-42fe-a75b-633107dc374d' and (van_id='ff1d59b8-8e80-4b08-b594-541d0c180e4e' or van_id is null) group by 1 order by 1;
```

## Undo (only if Dominic asks)

⛔ DO NOT RUN — reference only.

Reversing this is not a simple swap. After tonight, staff will have collected orders and online orders #30 onward will exist on TO. An undo would need to:
- move the 23 order_keys listed in backup.json back to FROM;
- restore their old numbers (24→1 … 29→6);
- recalculate both events' capacity.

It would be written as a new migration, from the backup, only on Dominic's request.

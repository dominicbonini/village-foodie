# capacity-window-1 — kitchen capacity window: 1–10, then 15–60 in steps of 5

**Status: STOPPED AT THE DIAGNOSIS. I need a decision before changing anything.** No code, migration, setting or row was changed. The only SQL run was read-only (listed at the end).

**Why I stopped:** the work order assumes the capacity window is a fixed bucket ("12 mains per 45-minute window") and that today's buckets line up with the clock. Neither is true. Kitchen capacity is a limit on how many items are being made **at the same moment**. The window does not group orders into buckets anywhere: not on the clock, not from the event start, not on the slot grid. So step 4's main check ("the 13th main in 19:00–19:45 is refused") can't pass by changing alignment. It needs a new meaning for kitchen capacity at 45, while step 3 and step 4 say 60, 30 and 5 must stay "exactly" as they are. One setting would then mean two different things depending on the number picked. That is a product decision, so I'm asking rather than choosing (§6).

---

## 1. Diagnosis

### 1.1 What "kitchen capacity N, window W" means in the engine today

Source: [lib/slot-availability.ts](../lib/slot-availability.ts). The rules are written in its comments and I confirmed them by running the engine (§1.4).

- **Kitchen capacity N is an "at once" limit.** No more than N counted items in production at any single moment.
- **Cooked categories** (prep time > 0) always count. An order collected at T cooks in back-to-back blocks of `prep` minutes ending at T, one batch per block: [T − prep, T), then [T − 2·prep, T − prep), and so on. The limit is checked moment by moment across those blocks ([projectBackwardOccupancy](../lib/slot-availability.ts#L1301), [fitOrderBackward](../lib/slot-availability.ts#L1619)). **The window W plays no part in this.** For cooked items, the pace is set entirely by the category's prep time and batch size, plus N.
- **Instant categories** (no prep time) count only when ticked. Each order's instant items are treated as a single moment at **T − W**, counted against N there. If that moment is already full, the rest moves one W earlier (T − 2W, …). The earliest allowed moment is max(event start − W, now) ([placeInstantPoints](../lib/slot-availability.ts#L1045), line 1059). So **W is a step measured back from each order's own collection time**, not a window that orders share.
- Two orders collected at different times (19:00 and 19:05) land at different moments (18:15 and 18:20 when W = 45) and never compete. So for instant items, N works out to "N per collection time" whatever W is. W only matters when one collection time overflows.

**In plain English, for the customer picker:** "Kitchen capacity 12 every 45 minutes" means "never more than 12 counted items being made at the same moment". It does **not** mean "at most 12 counted items collected in each 45-minute stretch".

### 1.2 Alignment, place by place

| Place | How W is used | Lined up to |
|---|---|---|
| Slot availability, customer picker and `/api/slots` ([buildSlotAvailability](../lib/slot-availability.ts#L99), via `projectBackwardOccupancy`/`fitOrderBackward`) | Instant points at T − W, moving back by W | Each order's own collection time. Not the clock, event start or slot grid. |
| Placement, ASAP and auto-confirm ([lib/orders/place-in-slot.ts:224](../lib/orders/place-in-slot.ts#L224), `earliestBackwardFitSlot`) | The same engine | The same: each collection time |
| Cooking reservation ([lib/orders/cooking-reservation.ts](../lib/orders/cooking-reservation.ts), `buildAdmittedReservation`) | Saved as `computed.capacityWindowMins`; only the cooked blocks are saved (on the prep grid) | The prep grid, ending at T. W is not used. |
| Demo seeding ([lib/seed-demo-orders.ts:481](../lib/seed-demo-orders.ts#L481)) | Reads the van's W and passes it to the same engine | The same: each collection time |
| Dashboard dots ([lib/slot-display.ts:185](../lib/slot-display.ts#L185), `buildSlotIndicators`) | The same projection. Each dot reads the block that ends at its own slot, keyed slot − prep (`backwardWindowStepMins`) | The prep grid (see the problem in §1.5) |
| Customer "Around HH:MM" estimate ([order/page.tsx:1870](../app/(app)/trucks/[slug]/order/page.tsx#L1870)) | Adds (⌈counted ÷ N⌉ − 1) × W minutes | A relative amount of time, no alignment |
| Capacity-breach detector ([lib/capacity-breach.ts](../lib/capacity-breach.ts)) | The same projection | The same: each collection time |

**Nothing is lined up to midnight or the clock.** Nothing is lined up to the event start either: the event start only sets the earliest allowed moment.

### 1.3 Windows that don't divide 60 (7, 9, 11, …)

There is no special case. No code takes W modulo 60 or rounds it to the clock, so 7 behaves like 5 or 10: instant points at T − 7, T − 14, …. Every value from 1 to 20 works the same way. The database CHECK allows 1–20 ([20260612_capacity_window_mins.sql](../supabase/migrations/20260612_capacity_window_mins.sql)). The Manage dropdown ([KitchenCapacitySection.tsx:384](../components/manage/KitchenCapacitySection.tsx#L384)), the dashboard dropdown ([dashboard page:5777](../app/(app)/dashboard/[token]/page.tsx#L5777)) and the menu-import dropdown ([manage page:~6378](../app/(app)/manage/[token]/page.tsx#L6378)) each offer 1–20. The `update_van_settings` API has no range check of its own, so the CHECK is the only guard.

### 1.4 Proof: the engine on a 19:00–21:15 event, 5-minute slots, capacity 12, adding one main at a time until refused

| Setup | Mains accepted per slot (19:00, 19:05, 19:10 …) | Total collected 19:00–19:40 |
|---|---|---|
| Mains instant, ticked, W = 45 | 12 at every slot | **108** |
| Mains instant, ticked, W = 60 | 12 at every slot | 108 |
| Mains instant, ticked, W = 5 | 12 at every slot | 108 |
| Mains cooked, prep 15, batch 12, W = 45 | 12 / 0 / 0 / 12 / 0 / 0 / 12 … | 36 |
| **Mains cooked, prep 15, batch 4 (Le Roi's real chicken), W = 45** | 4 / 0 / 0 / 4 / 0 / 0 / 4 … | **12** |
| Mains cooked, prep 45, batch 12, W = 45 | 12 at 19:00, then nothing until 19:45 | 12 |

Changing W from 5 to 45 to 60 makes **no difference** to how many mains get through. The cooked rows are set by prep and batch alone.

### 1.5 A display problem today with W > 5 and instant counted items (not fixed)

Instant points are recorded at T − W, but each dot reads the block keyed at slot − prep. With 12 instant counted mains collected at **20:30**:

| W | Slot shown red, and **removed from the customer's empty-basket list** | What the picker does with a basket |
|---|---|---|
| 5 | 20:25 | — |
| 45 | **19:45** | Still accepts 19:45 |
| 60 | **19:30** | — |

So with a long window, the dashboard dots and the customer's first list mark the wrong time full, up to W minutes too early, and disagree with the picker. This is exactly the step 4 requirement "the operator dots and placement agree with the customer picker". It is mild at 5 and gets worse as W grows, so offering 15–60 without fixing it would make it worse. (Le Roi is at W = 20 with ACCOMPAGNEMENTS ticked, so it is already slightly affected.)

### 1.6 Live data

```
capacity_window_mins | vans
5                    | 17
10                   | 3
20                   | 1   ← Le Roi du Churrasco, "Camion 1"
```

**No van has 11–14 or 16–19**, so nothing would need keeping as a leftover value. Everything in use (5, 10, 20) is in the new list.

Le Roi du Churrasco (van "Camion 1"): kitchen capacity **14**, window **20**. Categories (no per-van overrides):

| Category | Prep | Batch | Counts toward capacity |
|---|---|---|---|
| POULET | 15 min | 4 | yes (cooked, always counts) |
| ACCOMPAGNEMENTS | instant | — | **yes (ticked)** |
| BOLINHOS/RISOIS | instant | — | no |
| BOISSONS | instant | — | no |
| DESSERT | instant | 20 | no |

Note: the work order says "only Mains counting; drinks/sides never block". On the live truck, **sides (ACCOMPAGNEMENTS) are ticked, so they count today.** Drinks don't count.

---

## 2. What the truck already gets

Le Roi's chicken is set to **4 per batch, 15 minutes**. That already means at most 4 chickens on the grill at once, each taking 15 minutes, which is **12 chickens per 45 minutes**. On a 19:00 event: 4 for 19:00, 4 for 19:15, 4 for 19:30. A customer asking for a chicken in a full stretch is offered the next free time. The 14 / 20-minute kitchen capacity sits on top of that and mostly limits chicken plus sides together.

The difference from what they described: the limit **rolls** with bookings and is not three fixed boxes (19:00–19:45, 19:45–20:30, 20:30–21:15). It also won't let 12 chickens be collected at the same 19:00 slot, only 4, because the grill holds 4. If the truck can really cook 12 at once in 45 minutes, the honest setting is **POULET batch 12, prep 45**, but then the earliest collection becomes 45 minutes from now.

## 3. Steps 2–5: not started

Steps 2 (allowed values, migration, dropdowns), 3 (alignment), 4 (harness cases) and 5 (operator guidance) all depend on the decision in §6. Nothing has been run against Pizzeria Gusto or any truck. No harness or sweep was run, because nothing changed.

## 4. Changes made

None. No commits apart from this report.

## 5. SQL run (all read-only)

```sql
select capacity_window_mins, count(*) as vans from truck_vans group by 1 order by 1;
```
```sql
select t.slug, t.name, v.id as van_id, v.name as van, v.active, v.kitchen_capacity, v.capacity_window_mins
from trucks t join truck_vans v on v.truck_id=t.id
where t.name ilike '%churrasco%' or t.slug ilike '%churrasco%' or t.slug ilike '%roi%'
   or v.capacity_window_mins not in (1,2,3,4,5,6,7,8,9,10,15,20)
order by t.slug;
```
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.truck_vans'::regclass and contype='c';
```
```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('menu_categories','van_category_settings')
order by table_name, ordinal_position;
```
```sql
select e.event_date, e.start_time, e.end_time, e.van_id from events e join trucks t on t.id=e.truck_id
where t.slug='le-roi-du-churrasco' and e.event_date >= current_date order by e.event_date limit 5;
-- failed: the table is truck_events, not events. Not re-run; not needed.
```
```sql
select c.name, c.sort_order, c.is_active, c.prep_secs, c.batch_size, c.counts_toward_capacity,
       s.prep_secs as van_prep, s.batch_size as van_batch, s.counts_toward_capacity as van_counts
from menu_categories c join trucks t on t.id=c.truck_id
left join van_category_settings s on s.category_id=c.id and s.van_id='fa431e8e-41b8-4618-a050-32a11aba7b7d'
where t.slug='le-roi-du-churrasco' order by c.sort_order;
```

## 6. Decision needed

**Q1. What should "N every 45 minutes" mean?**
- **A. Recommended: keep today's meaning, an "at once" limit.** The engine stays as it is. Le Roi already gets about 12 chickens per 45 minutes from its chicken settings (§2). I would still do step 2 (values 1–10, 15–60; migration; every dropdown), fix the display problem in §1.5 so dots, the customer list and the picker agree at long windows, and replace step 4's "13th main refused" check with checks that fit this meaning.
- **B. Add a new "per-window total" meaning:** at most N counted items **collected** in each fixed window counted from the event start (19:00–19:45, 19:45–20:30, …), and once a window is full the customer is offered the next one. If this applies to **every** W, then 5, 30 and 60 change too, which breaks "unchanged". If it applies **only** to Ws that don't divide 60, then 45 and 60 mean different things.
- **C. Option B as a separate switch per van** (for example "Count per collection window"). Off by default, so Gusto and everyone else stay byte-identical. Le Roi would switch it on.

**Q2. If B or C:** should sides (ACCOMPAGNEMENTS, currently ticked on Le Roi) stay counted, or should I tell the truck to untick them?

**Q3. If A:** should step 2 (opening up 15–60) go ahead even though, under this meaning, W only changes how instant counted items spill over and the customer's "Around" estimate?

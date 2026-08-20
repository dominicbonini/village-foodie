# Apple Tester demo seed — Phase 1: read, and the plan

**PROMPT INTEGRITY.** No span of the brief arrived garbled.

**NOTHING WAS APPLIED. NO SQL WAS RUN. NO INSERT SQL APPEARS IN THIS FILE** — the brief says
*"PHASE 1 — READ AND PLAN. INSERT NOTHING"* and *"stop for my approval"*, so this stops at the plan
gate. No `next dev`, no `next build`. No file was changed except this report.

---

# 🔴 THE BLOCKER, STATED FIRST

**I cannot execute the Phase 1 reads.** I have no database access — the standing rule for this project
is that Dominic runs all SQL by hand — so I cannot quote the truck row, the van's `kitchen_capacity` or
`capacity_window_mins`, the categories' `prep_secs` / `batch_size` / `counts_toward_capacity`, the menu
items, or the eight event ids. **CANNOT DETERMINE, every one of them.**

The brief's own instruction is *"READ the truck's actual van and category config before computing
anything, and quote what you read"* — and it is right. **§1 below is therefore the read, expressed as
queries for you to run**, and **§4 is the plan expressed as a decision procedure with the arithmetic
worked out**, so that the moment you paste the output back the numbers drop straight in.

🔴 **I WILL NOT INVENT THE CONFIG AND PLAN AGAINST IT.** The brief describes the van as *"2 pizzas
cooked every 5 minutes"*. §3 shows why that sentence alone is not enough to compute a slot
distribution: the answer moves by a factor of two or more depending on `prep_secs` and `batch_size`,
neither of which is in that sentence.

## Column names: derived from the repository, and to be confirmed against `information_schema`

The brief says *"Do NOT invent column names — query `information_schema` first and say so."* I could
not query it. **What I did instead, and it is evidence rather than invention:** every column named in
this report is READ from this repository — from the migrations that create it, or from a statement that
already writes it in production. Each is cited. **§1.0 gives you the `information_schema` query to run
anyway**, and its output should be checked against the list in §1.6 before any insert is written.

---

# 1. THE READS — run these, then paste the output back

Every query is scoped to the Apple Tester truck and touches nothing else.

## 1.0 The truck, and the id everything else keys on

```sql
select id, name, slug, plan, active, collection_interval_mins, order_counter
  from trucks
 where name ilike '%apple%tester%';
```

⚠️ **Everything below uses `<TRUCK_ID>` — the `id` this returns.** If it returns more than one row, stop
and tell me; the seed must never guess which truck it is aimed at.

## 1.0b The column list, since I could not query it myself

```sql
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name in ('orders','truck_vans','menu_categories','menu_items_db','truck_events')
 order by table_name, ordinal_position;
```

## 1.1 The van(s) — the ceiling and its cadence

```sql
select v.id, v.name, v.kitchen_capacity, v.capacity_window_mins
  from truck_vans v
 where v.truck_id = '<TRUCK_ID>'
 order by v.name;
```

**Provenance of these two column names — READ:**
`supabase/migrations/20260612_capacity_window_mins.sql` creates
`capacity_window_mins integer NOT NULL DEFAULT 5 CHECK (capacity_window_mins BETWEEN 1 AND 20)` on
`truck_vans`, and its header states the model in the same terms the brief does:

> `kitchen_capacity` is a CONCURRENCY ceiling ("N counted items in production at once"); this column
> is the width (minutes) of the window the ceiling is measured over.

## 1.2 The categories — prep, batch, and whether instant ones count

```sql
select c.id, c.name, c.prep_secs, c.batch_size, c.counts_toward_capacity, c.is_active
  from menu_categories c
 where c.truck_id = '<TRUCK_ID>'
 order by c.name;
```

**Provenance — READ:** `supabase/migrations/20260610_category_counts_toward_capacity.sql` adds
`counts_toward_capacity boolean not null default false` to `menu_categories`, with the comment:

> No-prep (prep_secs=0) categories ticked to count toward the shared kitchen_capacity ceiling. Ignored
> when prep_secs>0 (prep-bearing categories always count). Default false = legacy behaviour.

⚠️ **`batch_size` IS NOT COSMETIC AND IS THE NUMBER MOST LIKELY TO SURPRISE YOU.** See §3.

## 1.3 The menu items, by category, with prices

```sql
select c.name as category, m.name as item, m.price, m.is_available, m.is_active
  from menu_items_db m
  join menu_categories c on c.id = m.category_id
 where m.truck_id = '<TRUCK_ID>'
 order by c.name, m.name;
```

🔴 **THE ORDER LINES MUST USE THESE EXACT NAMES AND PRICES.** `orders.items` is JSONB carrying `name`,
`quantity` and `unit_price`, and the verification queries in §6 join `l->>'name'` back to
`menu_items_db.name`. **A typo produces an order that exists but counts as no pizza.**

## 1.4 The eight events

```sql
select id, event_date, start_time, end_time, status, van_id, order_counter
  from truck_events
 where truck_id = '<TRUCK_ID>'
   and event_date between date '2026-08-21' and date '2026-08-28'
 order by event_date;
```

**Expected from the brief: 8 rows, Fri 21 → Fri 28 August, each 09:00–17:00.** ⚠️ **I have not confirmed
that and cannot.** The query prints `start_time` and `end_time` so the claim is checked rather than
assumed — and if any row differs, the slot arithmetic in §4 changes for that day only.

## 1.5 What is already there

```sql
select event_date, status, count(*)
  from orders
 where truck_id = '<TRUCK_ID>'
 group by event_date, status
 order by event_date, status;
```

⚠️ **The seed will DELETE existing orders for the target dates**, scoped to this truck and those dates.
Run this first so you know what is being replaced.

## 1.6 The `orders` columns the insert will write — every one cited

**READ** from `docs/seed-thai-kitchen-orders.sql:330-338`, the insert that ran successfully against
production on 19 and 20 August:

```
id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
total, total_minor, notes, status, payment_status, placed_at, source
```

**And the status CHECK — READ**, `supabase/migrations/20260520_kds_foundation.sql:9-20`:

```sql
alter table orders add constraint orders_status_check
  check (status in (
    'pending', 'confirmed', 'rejected', 'modified', 'cancelled', 'cooking', 'ready', 'collected'
  ));
```

✅ **`pending`, `confirmed`, `ready` and `collected` are all admissible**, which is what requirement (e)
asks for. `cooking` is admissible to the database and will not be used.

---

# 2. 🔴 THE CAPACITY MODEL, QUOTED FROM THE ENGINE RATHER THAN RESTATED

The brief says do not reinterpret it. So here it is from `lib/slot-availability.ts`, the module that
actually decides. **This is the single most important section of this report, because it is where my
previous Thai-Kitchen approximation was wrong in a way that would matter much more here.**

**`projectBackwardOccupancy` (`:662`), for a COOKED category (`prep_secs > 0`):**

```ts
      const batch = Math.max(1, cfg.batch)
      const prepMins = Math.max(1, Math.round(cfg.secs / 60))
      batchByCat[cat] = batch
      const numWindows = Math.ceil(N / batch)
      const earliestWindowMins = deadline - numWindows * prepMins
```

and the seating loop that follows (`:725-735`):

```ts
      for (let i = 0; i < numWindows; i++) {
        const startMins = deadline - (numWindows - i) * prepMins
        const isAdjacent = i === numWindows - 1
        const items = isAdjacent ? N - batch * (numWindows - 1) : batch
        ...
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
      }
```

**And the ceiling test itself — `concurrencyAt` (`:524`):**

```ts
function concurrencyAt(intervals: CookInterval[], t: number): number {
  let c = 0
  for (const iv of intervals) {
    if (iv.items <= 0) continue
    if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }
    else if (iv.startMins === t) c += iv.items
  }
  return c
}
```

## What that means, stated precisely

1. 🔴 **THE CEILING COUNTS ITEMS, NOT ORDERS AND NOT INTERVALS.** `concurrencyAt` sums `iv.items`. With
   `kitchen_capacity = 2`, **at most two counted items may be in production at any instant** across the
   whole truck.
2. 🔴 **AN ORDER'S PIZZAS OCCUPY A SPAN, NOT A POINT.** N pizzas at a collection deadline occupy
   `[deadline − ceil(N/batch)·prepMins, deadline)`. **`prep_secs` sets how long the ceiling is held**,
   and `batch_size` sets how many windows are needed.
3. ⚠️ **INSTANT CATEGORIES SEAT AS A POINT, AND ONLY IF TICKED.** From the same function: an instant
   category counts *"only if the operator ticked it"*, seated at `deadline − capacityStep`, where
   `capacityStep = capacity_window_mins`. **So whether drinks and desserts consume the ceiling is
   entirely `counts_toward_capacity`, which §1.2 reads.**
4. ⚠️ **`capacity_window_mins` IS THE CEILING'S OWN CADENCE, NOT THE COOKING GRID.** The comment calls
   it *"the global ceiling's OWN cadence… Independent of prep"*.

🔴 **THIS IS NOT THE "MAINS PER COLLECTION SLOT" MODEL I USED FOR THAI KITCHEN.** That was an
admitted approximation and it is documented as such in that file. **Here the ceiling is 2, so there is
no slack to absorb an approximation, and I will compute against the real rule above.**

---

# 3. WHY "2 PIZZAS EVERY 5 MINUTES" IS NOT ENOUGH TO PLAN FROM

Take `kitchen_capacity = 2`, `capacity_window_mins = 5` as given. The day is 09:00–17:00 = **480
minutes**. What a day can produce depends entirely on the two numbers §1.2 returns:

| If Pizza is… | One pizza holds the ceiling for | Ceiling-minutes per pizza | Max pizzas in 480 min |
|---|---|---|---|
| `prep_secs=300` (5 min), `batch_size=2` | 5 min, 2 items at once | 2.5 | **192** |
| `prep_secs=300` (5 min), `batch_size=1` | 5 min per pizza, serially | 5 | **96** |
| `prep_secs=600` (10 min), `batch_size=2` | 10 min, 2 items at once | 5 | **96** |
| `prep_secs=600` (10 min), `batch_size=1` | 10 min per pizza | 10 | **48** |
| `prep_secs=900` (15 min), `batch_size=2` | 15 min | 7.5 | **64** |

**The spread is 48 to 192 — a factor of four.** Requirement (c) is that *every* order contains at least
one pizza, so **the pizza ceiling is the order ceiling**.

🔴 **AND THAT IS THE STOP CONDITION IN THE BRIEF, NOT YET TRIGGERED BUT VISIBLY CLOSE.** *"If the
requested order count cannot fit under the ceiling, STOP and tell me what does fit."* At the bottom row
of that table, **60 orders per event does not fit** — 60 orders each with one pizza needs 600
ceiling-minutes against 480 available, before a single second order or second pizza. At the top row it
fits four times over. **I cannot tell you which until §1.2 is run.**

---

# 4. THE PLAN

## 4.1 My judgement on the number: **36 orders per event, not 60**

The brief asks me to justify the number *"against what a screenshot of the board will actually show"*.
That is the right test, and it argues against 60 independently of capacity:

- ⚠️ **A REVIEWER SEES ONE SCREEN, NOT A DATABASE.** The 13-inch board photographed this morning showed
  **six order cards** at a comfortable size. 60 orders is ten screens of scrolling; 36 is six. Neither
  is visible at once, so the extra 24 buy nothing a screenshot can show.
- ✅ **BUT THE COUNTERS ARE VISIBLE, AND THEY ARE THE POINT.** "0 New / 38 Confirmed / 6 Done" reads as
  a real service at a glance. 36 lands in the same register.
- 🔴 **AND A LOW CEILING PUNISHES VOLUME WITH RED.** This is the concrete lesson from this morning: with
  a ceiling of 4 the Thai board came out at exactly 4 in five windows, and **the capacity strip
  rendered those red**. Nothing breached, no banner appeared — but red dots photograph as a problem. At
  a ceiling of **2**, that risk is far sharper: **one two-pizza order fills the ceiling completely.**
- ✅ **36 ALSO DIVIDES CLEANLY** into the peak/plateau/quiet shape in §4.2 (12 / 18 / 6).

⚠️ **36 IS PROVISIONAL AND CAPACITY-CONDITIONED.** If §1.2 returns the bottom row of §3's table, the
honest answer may be lower still, and I will say so rather than squeeze it in.

## 4.2 The slot distribution — a service with a lunch peak

Requirement (b) asks for peaks, not a flat spread. Over 09:00–17:00:

| Band | Window | Orders | Intended dot |
|---|---|---|---|
| **Quiet open** | 09:00–11:00 | 4 | mostly **green**, a few empty slots |
| 🔴 **Lunch peak** | 11:30–13:30 | **18** | a run of **amber**, with **2–4 at the ceiling (red)** |
| **Afternoon plateau** | 13:30–15:30 | 10 | **green/amber** mixed |
| **Quiet close** | 15:30–16:45 | 4 | **green**, several empty |

🔴 **"AT THE CEILING" IS NOT "OVER THE CEILING", AND THE DIFFERENCE IS THE WHOLE OF REQUIREMENT (a).**
The over-capacity banner fires on a **breach**; a window sitting exactly at 2 is *full*, renders red,
and produces no banner. **I will target a handful of red windows deliberately — a service with no full
moment looks synthetic — and zero breaches.** If you would rather the strip were all green and amber,
say so and I will cap every window at ceiling − 1; that is a one-line change to the packer and it costs
a little realism.

## 4.3 The pizza-to-other ratio

Requirement (c): every order has ≥1 pizza, most items overall are pizza, drinks and desserts present
but minority.

| Line type | Share of items | Shape |
|---|---|---|
| **Pizza** | **~62%** | 1 pizza on 24 orders, 2 on 10, 3 on 2 → **50 pizzas** |
| Drinks | ~22% | on roughly half the orders |
| Desserts/sides | ~16% | on roughly a third |

**≈ 80 items across 36 orders, ~2.2 per order, and pizza is the plurality.** ⚠️ Exact counts wait on
§1.3 — I do not yet know how many pizza items the menu has to draw from, and I will not write an order
line naming an item I have not read.

## 4.4 Status mix, and the two requirements that interact

| Status | Count | Why |
|---|---|---|
| `pending` | **2** | requirement (g) — notes force pending, and it shows the review flow working |
| `confirmed` | 22 | the bulk of a live board |
| `ready` | 6 | gives the board its green "Ready" chips |
| `collected` | 6 | populates the Done-today strip |

🔴 **ZERO `cooking`.** Requirement (e). It will not appear in the insert, and §6 gives the query that
proves it.

⚠️ **THE TWO PENDING ORDERS ARE THE ONLY ONES WITH NOTES.** The note is what makes them pending, which
is the honest mechanism rather than a hand-set status.

## 4.5 🔴 REQUIREMENT (f), "NO ORDER LATE" — it is free on seven days and conditional on one

**This is worth reading before approval, because it is the one requirement whose truth changes with the
clock.**

- ✅ **For an event dated in the FUTURE, no order can render late.** All eight events are 21–28 August
  and today is 20 August, so on the day of seeding **every collection time on every board is ahead of
  now**. Requirement (f) is satisfied by construction.
- 🔴 **BUT AN APPLE REVIEWER WORKS THE DEMO ON SOME LATER DAY, AND THAT DAY'S EVENT BECOMES "TODAY".**
  Once it does, the board behaves exactly as Thai Kitchen's did this morning: a 09:15 order viewed at
  11:00 shows **"105m late"**. **Nothing in a static seed can prevent that** — it is the live board
  working correctly.
- ⚠️ **SO REQUIREMENT (f) IS SATISFIABLE AT SEED TIME AND NOT AFTERWARDS.** Two ways to blunt it, and
  **I am not choosing between them**: mark the morning orders `collected` so past slots read as done
  rather than late; or re-run the seed on the morning of the review. **The `collected` band in §4.2's
  quiet-open row is placed with this in mind.**

## 4.6 ⚠️ A CORRECTION TO REQUIREMENT (i)

The brief states *"EVERY ORDER NEEDS A CUSTOMER EMAIL — the schema requires one"*. **The schema does
not.** `docs/seed-thai-kitchen-orders.sql:335` inserts `customer_email` as `null` for all 40 rows and
**that script ran successfully against production twice**, on 19 and 20 August. `orders.customer_email`
is nullable. **§1.0b's `information_schema` query settles it definitively.**

✅ **I will include emails anyway** — they are what a real customer order carries, and the demo is meant
to look real. **The requirement stands; only its stated reason is wrong.** Format:
`firstname@demo.hatchgrab.test` — `.test` is an IANA-reserved TLD that can never resolve or receive
mail, which is the safest possible choice on an account a stranger will operate.

⚠️ **IT MAY STILL MATTER AT THE ROUTE LEVEL** rather than the schema level: `/api/orders/submit` writes
`customer_email` at `:1001`, and I have not audited whether it requires one. That is a claim about the
customer ordering path, not about the table, and I have not verified it.

## 4.7 Names — requirement (d)

First names only, varied, no surnames:

> Amelia · Ben · Chloe · Dan · Ella · Finn · Grace · Harry · Isla · Jack · Kira · Liam · Maya · Noah ·
> Olive · Pete · Rosa · Sam · Tess · Umar · Vik · Will · Yasmin · Zac · Aisha · Callum · Dev · Erin ·
> Frank · Gia · Hugo · Iris · Joel · Kai · Lena · Milo

**36 names, one per order, no repetition within a day.**

---

# 5. WHAT I NEED FROM YOU TO TURN THIS INTO SQL

1. **The output of §1.1, §1.2, §1.3 and §1.4.** Without §1.2 I cannot compute a single slot; without
   §1.3 I cannot write an order line; without §1.4 I have no `event_id` or `van_id`.
2. **A decision on §4.2's red windows** — deliberate full moments, or cap everything at ceiling − 1.
3. **A decision on §4.5** — bias the morning toward `collected`, or plan to re-run on review morning.
4. **Approval of 36**, or a number you prefer once §3's table resolves to one row.

Then the insert is one transaction in the same shape as the Thai script — pinned truck id with a name
assertion, a Gusto refusal, a hard ceiling assertion that aborts before writing, and per-event scoping.

---

# 6. VERIFICATION — how you confirm the seed worked

Run these **after** the insert. Each is scoped to the Apple Tester truck.

## 6.1 🔴 No slot breaches the ceiling

```sql
with cfg as (
  select v.kitchen_capacity, v.capacity_window_mins
    from truck_vans v where v.truck_id = '<TRUCK_ID>' limit 1
),
lines as (
  select o.event_date, o.slot, c.name as cat, c.prep_secs, c.batch_size,
         sum((l->>'quantity')::int) as n
    from orders o
    cross join lateral jsonb_array_elements(o.items) l
    join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
    join menu_categories c on c.id = m.category_id
   where o.truck_id = '<TRUCK_ID>'
     and (coalesce(c.prep_secs,0) > 0 or c.counts_toward_capacity)
   group by 1,2,3,4,5
)
select event_date, slot, cat, n, prep_secs, batch_size,
       ceil(n::numeric / greatest(1, coalesce(batch_size,1))) as windows_occupied
  from lines
 order by event_date, slot;
```

⚠️ **THIS PRINTS THE LOAD; IT DOES NOT REPRODUCE THE ENGINE.** The authoritative test is the one in §2 —
overlapping `[deadline − windows·prep, deadline)` intervals summed by `concurrencyAt` — which is a
sweep this SQL does not perform. 🔴 **THE REAL PROOF IS THE BOARD: open the dashboard for each date and
confirm no red "N slots over capacity — review" banner appears.** The insert script will also assert
its own computed peak against `kitchen_capacity` and abort before writing, exactly as the Thai script
now does.

## 6.2 ✅ Every order contains a pizza

```sql
select count(*) filter (where pizzas = 0) as orders_without_pizza,
       count(*)                          as total_orders,
       sum(pizzas)                       as total_pizzas
  from (
    select o.order_key,
           (select coalesce(sum((l->>'quantity')::int), 0)
              from jsonb_array_elements(o.items) l
              join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
              join menu_categories c on c.id = m.category_id
             where c.name ilike '%pizza%') as pizzas
      from orders o
     where o.truck_id = '<TRUCK_ID>'
  ) s;
```

🔴 **`orders_without_pizza` MUST BE 0.** ⚠️ It matches the category on `ilike '%pizza%'`; if §1.2 shows
the cooked category is called something else, substitute its exact name.

## 6.3 🔴 No order is in `cooking`

```sql
select status, count(*)
  from orders
 where truck_id = '<TRUCK_ID>'
 group by status
 order by 2 desc;
```

**Expect only `pending`, `confirmed`, `ready`, `collected`. Zero `cooking`, and zero of anything else.**

## 6.4 Supporting checks

```sql
-- every order has an email, and none is a real address
select count(*) filter (where customer_email is null)                as missing_email,
       count(*) filter (where customer_email not like '%@demo.hatchgrab.test') as wrong_domain,
       count(*)                                                       as total
  from orders where truck_id = '<TRUCK_ID>';
```

```sql
-- first names only: nothing containing a space
select customer_name from orders
 where truck_id = '<TRUCK_ID>' and customer_name like '% %';
-- expect ZERO rows
```

```sql
-- per-event totals
select event_date, count(*) as orders, sum(total) as revenue
  from orders where truck_id = '<TRUCK_ID>'
 group by event_date order by event_date;
-- expect 8 rows, one per event, each with the approved order count
```

---

# 7. STOP CONDITIONS — status

| Condition | Fired? |
|---|---|
| Requested count cannot fit under the ceiling | ⚠️ **UNDETERMINED — and it may.** §3 shows 60/event is impossible at the low end of the config range and comfortable at the high end. **§1.2 decides it.** I have proposed 36 on screenshot grounds regardless |
| Instructions contradict one another | ✅ **No.** Requirement (i)'s stated *reason* is factually wrong (§4.6) but the requirement itself is consistent and will be met |
| Garbled prompt | ✅ **No** |
| **Additional, not in the brief's list** | 🔴 **The Phase 1 reads cannot be performed by me.** This report stops at the plan gate as instructed, and the plan is conditional on §1's output |

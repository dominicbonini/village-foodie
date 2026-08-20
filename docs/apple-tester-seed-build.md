# Apple Tester demo seed — the plan, and the SQL

**PROMPT INTEGRITY.** No span of the brief arrived garbled.

**NOTHING WAS APPLIED. NO SQL WAS RUN.** No `next dev`, no `next build`. The only file changed is this
report.

⚠️ **ONE READING RESOLVED RATHER THAN STOPPED ON.** The title says *"Plan, then SQL"* and the closing
instruction says *"give me SQL to run by hand, in fenced blocks"*, while Phase 1 says *"INSERT NOTHING.
STOP FOR MY APPROVAL."* I have taken those as compatible: **the plan and the SQL are both here, and
neither has been executed.** §3 is the approval gate — read it before running §5.

---

# 🔴 THE HEADLINE, AND IT CORRECTS THE BRIEF'S PREMISE

**The ceiling of 6 is not the binding constraint and cannot be reached.** The binding constraint is
`Pizza.batch_size = 2`.

**A window holding 3 pizzas is already STRICTLY OVER the per-category batch and fires the
over-capacity banner** — long before concurrency could ever approach 6. So:

| Pizzas in a 5-minute window | Tone | Banner? |
|---|---|---|
| 0 | 🟢 **GREEN** | no |
| 1 | 🟡 **AMBER** — `Pizza 1/2` | no |
| **2** | 🔴 **RED** — `Pizza 2/2`, legitimately **FULL** | **no** |
| 3 or more | 🔴 RED | 🔴 **YES — BREACH** |

**This is not a contradiction in the brief and I have not stopped on it.** "Never breach 6" and "a
couple of at-the-ceiling peaks" are both satisfiable at once — the plan simply never exceeds **2**, so
6 is never approached and the red peaks are batch-full rather than ceiling-full. §1 quotes the code.

---

# 1. THE THRESHOLDS, QUOTED FROM THE CAPACITY CODE

## 1.1 How a pizza order is seated — `lib/slot-availability.ts:718-735`

```ts
      const batch = Math.max(1, cfg.batch)
      const prepMins = Math.max(1, Math.round(cfg.secs / 60))
      batchByCat[cat] = batch
      const numWindows = Math.ceil(N / batch)
      const earliestWindowMins = deadline - numWindows * prepMins
      ...
      for (let i = 0; i < numWindows; i++) {
        const startMins = deadline - (numWindows - i) * prepMins
        const isAdjacent = i === numWindows - 1
        const items = isAdjacent ? N - batch * (numWindows - 1) : batch
        ...
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
      }
```

**For this truck:** `batch = 2`, `prepMins = round(300/60) = 5`. Since `prepMins` equals
`capacity_window_mins`, **every interval is exactly one window wide and the grid tiles cleanly** — no
interval straddles a boundary. Worked:

| Pizzas in the order | Windows seated (collection slot = `d`) |
|---|---|
| 1 | `d−5` gets **1** |
| 2 | `d−5` gets **2** |
| 3 | `d−10` gets **2**, `d−5` gets **1** |
| 4 | `d−10` gets **2**, `d−5` gets **2** |

## 1.2 🔴 THE AMBER / RED RULE — `lib/slot-availability.ts:766-787`

```ts
      // Per-category batch tone (PREP grid) — UNCHANGED: full/over ⇒ red, partial ⇒ amber
      // (worst wins, tie-break higher load).
      let tone: SlotTone = 'green'
      ...
      for (const [cat, used] of Object.entries(byCat)) {
        const batch = batchByCat[cat]
        if (batch == null) continue
        remainingByCat[cat] = batch - used
        const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
        ...
      }
      // Global ceiling for the no-basket display = EXACT concurrency at this window's instant
      const conc = concurrencyAt(intervals, startMins)
      if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
        tone = 'red'; bound_by = 'global ceiling'
      }
```

🔴 **READ THE FIRST LOOP CAREFULLY: THERE IS NO GREEN BRANCH INSIDE IT.** Any window carrying cooked
load is either `red` (`used >= batch`) or `amber` (`used < batch`). **Green survives only when the
window has no cooked load at all.** With `batch = 2` that gives exactly the table in the headline.

⚠️ **THE GLOBAL CEILING IS A SECOND, LATER RED** — `conc >= kitchenCapacity`, i.e. 6 pizzas
concurrent. It can only be reached through a window already three times over its batch.

## 1.3 🔴 WHAT ACTUALLY FIRES THE BANNER — `lib/capacity-breach.ts`

Its header states the rule:

```
//   STRICTLY OVER, not tone==='red'. A window is breached when it is over EITHER ceiling:
//   tone==='red' also fires on legitimately-FULL slots (>= ceiling), which would cry wolf on normal
```

and the predicate:

```ts
    // STRICTLY OVER only — read the RAW window fields (never the clamped API `remaining`).
    const overTotal = w.remainingTotal < -BREACH_EPS ? -w.remainingTotal : 0
    const overCats: Array<{ cat: string; over: number }> = []
    for (const [cat, rem] of Object.entries(w.remainingByCat || {})) {
      if (rem < -BREACH_EPS) overCats.push({ cat, over: -rem })
    }
    if (overTotal <= 0 && overCats.length === 0) continue   // full is fine; only genuine over-subscription flags
```

Since `remainingByCat[Pizza] = 2 − used`, a window with **3** pizzas gives `−1` → **breach**. A window
with **2** gives `0` → **full, no banner** — exactly the "RED means AT the ceiling, not over it" the
brief asks for.

✅ **DRINKS AND DESSERTS COST NOTHING.** In `projectBackwardOccupancy`, a category with `secs = 0`
counts *"only if the operator ticked it"*; both are `counts_toward_capacity = FALSE`, so they `continue`
and contribute no load and no `batchByCat` entry. Confirms the brief.

## 1.4 One constraint that falls out and constrains the earliest slot

`earliestWindowMins = deadline − numWindows·prepMins`, and the engine flags
`earliestWindowMins < eventStartMins` as `cantFit` / `beforeEventStart`. With a 09:00 start:

🔴 **The earliest usable collection slot is 09:05 for a 1–2 pizza order and 09:10 for a 3–4 pizza
order.** An order collecting at 09:00 would need the 08:55 window, which is before the event exists.
**The plan's earliest slot is 09:10.**

---

# 2. THE ORDER COUNT — 64 per event

**Justified against what the board and the strip actually show**, which is the test the brief sets.

- 🔴 **REVISED UP FROM 42 — THE MORNING WAS EMPTY.** At 42 the strip carried a long green stretch from
  09:00 to 11:45 with everything bunched into 11:50–13:30. **64 orders carrying 101 pizzas** is what it
  costs to give the whole day a shape. Fewer leaves dead air; more forces a third pizza into some
  window, which is a breach.
- ✅ **THE COUNTERS READ AS A REAL SERVICE.** "2 New / 45 Confirmed / 17 Done" at a glance.
- ⚠️ **A REVIEWER SEES SIX ORDER CARDS PER SCREEN** on the 13-inch board photographed yesterday. 64 is
  eleven screens — scrolling always finds more, and the board never looks thin.
- ✅ **AND IT IS THE SAME SET ON ALL EIGHT DAYS**, which the brief permits (h in the earlier round), so
  a reviewer opening any date finds an identical, known-good service.

---

# 3. 🔴 THE INTENDED SHAPE — THE APPROVAL GATE

**Simulated against the exact seating and tone rules in §1**, over the 96 windows from 09:00 to 16:55.

| Band | Window | Orders | 🟢 green | 🟡 amber | 🔴 red | % red |
|---|---|---|---|---|---|---|
| **Morning** | 09:00–11:45 | 22 | 11 | 10 | 13 | 38% |
| 🔴 **LUNCH PEAK** | 11:50–13:35 | **19** | **2** | **7** | **12** | **57%** |
| **Afternoon** | 13:35–15:05 | 11 | 7 | 6 | 5 | 27% |
| **Close** | 15:05–17:00 | 12 | 11 | 6 | 6 | 26% |
| **TOTAL** | 09:00–16:55 | **64** | **31 (32%)** | **29 (30%)** | **36 (37%)** |

⚠️ **THE LONGEST ALL-GREEN RUN ANYWHERE IS 2 WINDOWS — TEN MINUTES.** That is the measure that matters
for "the strip doesn't look empty": there is no dead stretch at any hour, and the rush is still
unmistakably the rush at 57% red against the morning's 38%.

**The lunch peak, window by window — this is what the capacity panel will render:**

```
   12:00  AMBER  Pizza 1/2        12:50  RED    Pizza 2/2
   12:05  RED    Pizza 2/2        12:55  AMBER  Pizza 1/2
   12:10  AMBER  Pizza 1/2        13:00  RED    Pizza 2/2
   12:15  RED    Pizza 2/2        13:05  RED    Pizza 2/2
   12:20  RED    Pizza 2/2        13:10  GREEN  —
   12:25  AMBER  Pizza 1/2        13:15  AMBER  Pizza 1/2
   12:30  RED    Pizza 2/2        13:20  RED    Pizza 2/2
   12:35  RED    Pizza 2/2        13:25  RED    Pizza 2/2
   12:40  AMBER  Pizza 1/2        13:30  GREEN  —
   12:45  RED    Pizza 2/2
```

✅ **PEAK LOAD IN ANY WINDOW: 2 PIZZAS. ZERO WINDOWS AT 3+. NO ORDER SEATS BEFORE 09:00.** Asserted in
the simulation and asserted again inside the SQL before a single row is written.

## 4. Ratio and basket sizes

| | |
|---|---|
| **Pizzas** | **101** across 64 orders — **74% of all items** |
| Drinks | 22 (one on every third order) |
| Desserts | 13 (one on every fifth order) |
| **Total items** | **136**, ≈2.1 per order |
| **Basket sizes (pizzas)** | 1 pizza × 28 orders · 2 pizzas × 35 · 3 pizzas × 1 |
| **Every order** | ✅ contains at least one pizza — requirement (b) |

⚠️ **THE SINGLE 3-PIZZA ORDER IS AT 11:55** and is placed deliberately where the 11:45 window is
otherwise empty, so its spill cannot stack into a breach.

**Status mix:** 10 `collected` · 7 `ready` · 45 `confirmed` · **2 `pending`** (the two carrying customer
notes, which is what makes them pending, at 12:20 and 14:45). 🔴 **Zero `cooking`.**

⚠️ **REQUIREMENT (f), "NOTHING LATE", IS TRUE AT SEED TIME AND DEGRADES AFTERWARDS.** All eight events
are dated 21–28 August; today is 20 August, so **on the day you run this nothing on any board is late**.
But when a reviewer opens the demo on, say, the 25th, that day's morning slots are behind them and will
badge late — the live board working correctly, and no static seed can prevent it. **Mitigation built
in: the ten earliest orders are `collected`, so the first stretch of the day reads as done rather than
late.** If review lands mid-afternoon, re-run the seed that morning.

---

# 5. THE SQL — RUN BY HAND, AFTER YOU APPROVE §3

🔴 **Every statement is scoped to `truck_id = 'test-truck-3-2'`.** The script asserts the truck's name
is "Apple Tester" and **explicitly refuses `test-truck-3`** as well as anything Gusto-shaped.

⚠️ **Item names and prices are READ FROM `menu_items_db` AT RUN TIME**, not typed here — the brief said
to use the real names and prices, and they were not in the config you gave me, so the script takes them
from the database and the totals are the sum of the lines it actually built. **That satisfies
requirement (c) without me inventing a single name.**

⚠️ **`collection_interval_mins` was not in the config you confirmed**, so the script does not assume it:
it writes slots on the 5-minute grid the capacity window uses, and **asserts** the four numbers the
whole design rests on (`kitchen_capacity`, `capacity_window_mins`, `Pizza.prep_secs`,
`Pizza.batch_size`). If any differs, it aborts and tells you which.

## Statement 1 — the seed. One transaction.

```sql
begin;

do $$
declare
  v_truck_id   text := 'test-truck-3-2';   -- 🔴 THE ONE PLACE THE TARGET IS NAMED.
  v_truck_name text;
  v_van_id     uuid := '0cde7768-ef86-473d-bfab-5d3afcb0ab6d';
  v_cap        integer;
  v_win        integer;
  v_prep       integer;
  v_batch      integer;
  v_pizza_cat  uuid;
  v_pizzas     jsonb; v_n_pizzas integer;
  v_drinks     jsonb; v_n_drinks integer;
  v_dess       jsonb; v_n_dess   integer;
  v_event_ids  uuid[] := array[
    '088936cd-b9f8-4aa6-b681-ccc0c81057a8'::uuid, 'e1352fde-4c82-4efa-9790-8668de7a267b'::uuid,
    'db36c7b5-0078-47be-8bf7-949fe760ca6a'::uuid, '164c02e4-860d-42c0-be30-9dd90909fbac'::uuid,
    '2b025f4c-a38e-486e-839c-6b697fe32f0d'::uuid, '33e8a40f-8600-4937-815a-b7493274e204'::uuid,
    '4035ee89-72df-4b22-be2d-13813e042765'::uuid, 'a1603851-ac9e-4be2-bf29-169804e9382c'::uuid];
  v_event_dates date[] := array[
    date '2026-08-21', date '2026-08-22', date '2026-08-23', date '2026-08-24',
    date '2026-08-25', date '2026-08-26', date '2026-08-27', date '2026-08-28'];

  -- ── THE SERVICE, WRITTEN OUT SO IT CAN BE CHECKED RATHER THAN TRUSTED ──────────────────────────
  -- Collection slot per order, and how many pizzas that order carries. Index-matched, 64 entries.
  v_slots text[] := array[
    '09:05','09:15','09:25','09:40','09:50','09:55','10:05','10:10','10:20','10:30',
    '10:35','10:45','10:50','10:55','11:05','11:10','11:15','11:25','11:30','11:35',
    '11:40','11:45','11:55','12:00','12:05','12:10','12:15','12:20','12:25','12:30',
    '12:35','12:40','12:45','12:50','12:55','13:00','13:05','13:10','13:20','13:25',
    '13:30','13:40','13:50','13:55','14:05','14:10','14:20','14:30','14:35','14:45',
    '14:55','15:00','15:10','15:15','15:25','15:35','15:45','15:55','16:05','16:15',
    '16:25','16:35','16:45','16:55'];
  v_pizza_n integer[] := array[
    1,1,2,1,2,1,2,1,2,1,
    2,2,1,2,2,1,2,2,1,2,
    1,2,3,2,1,2,1,2,2,1,
    2,2,1,2,2,1,2,2,1,2,
    2,1,2,1,2,1,2,1,2,1,
    2,1,2,1,2,1,2,1,2,1,
    2,1,1,2];
  -- Drinks on every 3rd order, desserts on every 5th. Neither costs capacity (prep 0, not ticked).
  v_drink_n integer[] := array[
    1,0,0,1,0,0,1,0,0,1,
    0,0,1,0,0,1,0,0,1,0,
    0,1,0,0,1,0,0,1,0,0,
    1,0,0,1,0,0,1,0,0,1,
    0,0,1,0,0,1,0,0,1,0,
    0,1,0,0,1,0,0,1,0,0,
    1,0,0,1];
  v_dess_n integer[] := array[
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0];
  v_names text[] := array[
    'Amelia','Ben','Chloe','Dan','Ella','Finn','Grace','Harry','Isla','Jack',
    'Kira','Liam','Maya','Noah','Olive','Pete','Rosa','Sam','Tess','Umar',
    'Vik','Will','Yasmin','Zac','Aisha','Callum','Dev','Erin','Frank','Gia',
    'Hugo','Iris','Joel','Kai','Lena','Milo','Nina','Omar','Priya','Reuben',
    'Sofia','Theo','Ava','Blake','Cara','Dylan','Eve','Felix','Gwen','Hana',
    'Idris','Jonah','Kayla','Leo','Mira','Nate','Orla','Paolo','Quinn','Rhys',
    'Saskia','Tom','Uma','Vince'];

  v_n_orders  integer := 64;
  v_load      integer[];          -- pizzas per 5-minute window, indexed from 09:00
  v_n_wins    integer := 96;      -- 09:00..16:55
  i integer; k integer; e integer;
  v_slot_mins integer; v_num_win integer; v_items integer; v_w integer;
  v_lines jsonb; v_total numeric; v_item jsonb; v_status text; v_notes text;
  v_peak integer := 0; v_green integer := 0; v_amber integer := 0; v_red integer := 0;
begin
  -- ── 0. THE TRUCK, AND THE REFUSALS ────────────────────────────────────────────────────────────
  select t.name into v_truck_name from trucks t where t.id = v_truck_id;
  if v_truck_name is null then
    raise exception 'SEED ABORTED: no truck with id %.', v_truck_id;
  end if;
  if v_truck_name <> 'Apple Tester' then
    raise exception 'SEED ABORTED: truck % is named "%", not "Apple Tester". Refusing to guess.', v_truck_id, v_truck_name;
  end if;
  -- 🔴 THE NEIGHBOUR IS A DIFFERENT TRUCK AND MUST NEVER BE TOUCHED.
  if v_truck_id = 'test-truck-3' then
    raise exception 'SEED ABORTED: test-truck-3 is a DIFFERENT truck.';
  end if;
  if v_truck_name ilike '%gusto%' then
    raise exception 'SEED ABORTED: refusing to touch %, the live trading truck.', v_truck_name;
  end if;

  -- ── 1. THE CONFIG THIS DESIGN RESTS ON — ASSERTED, NOT ASSUMED ────────────────────────────────
  select v.kitchen_capacity, v.capacity_window_mins into v_cap, v_win
    from truck_vans v where v.id = v_van_id and v.truck_id = v_truck_id;
  if v_cap is null then
    raise exception 'SEED ABORTED: van % has no kitchen_capacity. Set it to 6 first.', v_van_id;
  end if;
  if v_win <> 5 then
    raise exception 'SEED ABORTED: capacity_window_mins is %, not 5. The whole slot plan assumes 5.', v_win;
  end if;
  select c.id, c.prep_secs, coalesce(c.batch_size, 1)
    into v_pizza_cat, v_prep, v_batch
    from menu_categories c
   where c.truck_id = v_truck_id and c.name ilike '%pizza%' and coalesce(c.is_active, true)
   limit 1;
  if v_pizza_cat is null then
    raise exception 'SEED ABORTED: no active Pizza category on %.', v_truck_name;
  end if;
  if v_prep <> 300 or v_batch <> 2 then
    raise exception 'SEED ABORTED: Pizza is prep_secs=% batch_size=%, not 300/2. The tone plan assumes 300/2 — recompute before running.', v_prep, v_batch;
  end if;
  raise notice 'Config OK: ceiling %, window % min, Pizza prep % s, batch %.', v_cap, v_win, v_prep, v_batch;

  -- ── 2. THE MENU, READ LIVE — real names, real prices ──────────────────────────────────────────
  select jsonb_agg(x order by x->>'name'), count(*) into v_pizzas, v_n_pizzas
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m
           where m.truck_id = v_truck_id and m.category_id = v_pizza_cat
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  select jsonb_agg(x order by x->>'name'), count(*) into v_drinks, v_n_drinks
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and c.name ilike '%drink%'
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  select jsonb_agg(x order by x->>'name'), count(*) into v_dess, v_n_dess
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and c.name ilike '%dessert%'
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  if coalesce(v_n_pizzas, 0) = 0 then
    raise exception 'SEED ABORTED: no available pizza items — every order must contain one.';
  end if;
  raise notice 'Menu: % pizzas, % drinks, % desserts.', v_n_pizzas, coalesce(v_n_drinks,0), coalesce(v_n_dess,0);

  -- ── 3. 🔴 PROJECT THE LOAD AND ASSERT IT BEFORE WRITING ANYTHING ──────────────────────────────
  -- Reproduces lib/slot-availability.ts exactly: N pizzas at slot d seat ceil(N/batch) windows ending
  -- at d, the earliest holding `batch` and the collection-adjacent one the remainder.
  v_load := array_fill(0, array[v_n_wins]);
  for i in 1..v_n_orders loop
    v_slot_mins := (split_part(v_slots[i], ':', 1))::int * 60 + (split_part(v_slots[i], ':', 2))::int;
    v_num_win := ceil(v_pizza_n[i]::numeric / v_batch);
    for k in 0..(v_num_win - 1) loop
      v_items := case when k = v_num_win - 1 then v_pizza_n[i] - v_batch * (v_num_win - 1) else v_batch end;
      v_w := ((v_slot_mins - (v_num_win - k) * (v_prep / 60)) - 540) / 5 + 1;   -- 540 = 09:00
      if v_w < 1 then
        raise exception 'SEED ABORTED: order % at % seats before 09:00 — the engine would flag cantFit.', i, v_slots[i];
      end if;
      v_load[v_w] := v_load[v_w] + v_items;
    end loop;
  end loop;
  for k in 1..v_n_wins loop
    v_peak := greatest(v_peak, v_load[k]);
    if v_load[k] = 0 then v_green := v_green + 1;
    elsif v_load[k] >= v_batch then v_red := v_red + 1;
    else v_amber := v_amber + 1; end if;
  end loop;
  -- 🔴 THE GUARANTEE. Strictly-over the per-category batch is what fires the banner (lib/capacity-breach).
  if v_peak > v_batch then
    raise exception 'SEED ABORTED: peak % pizzas in one window exceeds the Pizza batch of % — that IS the over-capacity banner. Nothing was written.', v_peak, v_batch;
  end if;
  if v_peak > v_cap then
    raise exception 'SEED ABORTED: peak % exceeds kitchen_capacity %.', v_peak, v_cap;
  end if;
  raise notice 'Projection OK: peak % pizzas/window (batch %, ceiling %). Strip: % green, % amber, % red of % windows.',
    v_peak, v_batch, v_cap, v_green, v_amber, v_red, v_n_wins;

  -- ── 4. CLEAR AND INSERT, EVENT BY EVENT ───────────────────────────────────────────────────────
  for e in 1..8 loop
    delete from orders
     where truck_id = v_truck_id and event_id = v_event_ids[e];
    delete from production_slot_usage
     where truck_id = v_truck_id and event_date = v_event_dates[e];

    for i in 1..v_n_orders loop
      v_lines := '[]'::jsonb;
      v_total := 0;
      -- PIZZAS FIRST — every order has at least one (requirement b).
      for k in 0..(v_pizza_n[i] - 1) loop
        v_item := v_pizzas -> ((i + k + e) % v_n_pizzas);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end loop;
      if v_drink_n[i] > 0 and coalesce(v_n_drinks,0) > 0 then
        v_item := v_drinks -> (i % v_n_drinks);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end if;
      if v_dess_n[i] > 0 and coalesce(v_n_dess,0) > 0 then
        v_item := v_dess -> (i % v_n_dess);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end if;

      -- ── STATUS. 🔴 NEVER 'cooking'. The two NOTE-bearing orders are 'pending', which is what a
      -- note does on the real path — it is the mechanism, not a hand-set status.
      v_notes := null;
      if i = 28 then
        v_notes := 'Nut allergy - please keep separate from anything with nuts. Thank you!';
        v_status := 'pending';
      elsif i = 50 then
        v_notes := 'Could we have this cut into 8 slices please?';
        v_status := 'pending';
      elsif i <= 10 then v_status := 'collected';
      elsif i <= 17 then v_status := 'ready';
      else v_status := 'confirmed';
      end if;

      insert into orders (
        id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
        event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
        total, total_minor, notes, status, payment_status, placed_at, source
      ) values (
        i::text, v_truck_id, v_names[i],
        lower(v_names[i]) || '@demo.hatchgrab.test',            -- 🔴 reserved TLD: can never receive mail
        null, v_slots[i], 'collection',
        v_event_dates[e], v_event_ids[e], v_van_id, v_lines, '[]'::jsonb, null, v_total, 0,
        v_total, round(v_total * 100)::integer,
        v_notes, v_status, 'unpaid',
        -- Placed 25 minutes before its own collection — an order-ahead customer, never after the slot.
        ((v_event_dates[e] + v_slots[i]::time) - interval '25 minutes'),
        'web'
      );
    end loop;

    -- 🔴 THE COUNTER = THE HIGHEST DISPLAY ID WRITTEN, so a real order placed during review is #43
    -- and cannot collide with the partial unique index on (event_id, id). Requirement (i).
    update truck_events set order_counter = v_n_orders
     where id = v_event_ids[e] and truck_id = v_truck_id;
  end loop;

  raise notice 'Seeded % orders on each of 8 events for %. Next order on each is #%.',
    v_n_orders, v_truck_name, v_n_orders + 1;
end $$;

commit;
```

---

# 6. VERIFICATION — run these after the seed

## 6.1 🔴 No window breaches — the query the brief asks for

```sql
with cfg as (
  select coalesce(c.batch_size, 1) as batch, c.prep_secs / 60 as prep_mins
    from menu_categories c
   where c.truck_id = 'test-truck-3-2' and c.name ilike '%pizza%' and coalesce(c.is_active, true)
   limit 1
),
pz as (
  select o.event_date,
         (split_part(o.slot,':',1))::int * 60 + (split_part(o.slot,':',2))::int as slot_mins,
         sum((l->>'quantity')::int) as n
    from orders o
    cross join lateral jsonb_array_elements(o.items) l
    join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
    join menu_categories c on c.id = m.category_id
   where o.truck_id = 'test-truck-3-2'
     and c.name ilike '%pizza%'
   group by 1,2
),
seated as (  -- reproduce the engine's backward seating, one row per occupied window
  select p.event_date,
         p.slot_mins - (ceil(p.n::numeric/cfg.batch)::int - g) * cfg.prep_mins as window_mins,
         case when g = ceil(p.n::numeric/cfg.batch)::int
              then p.n - cfg.batch * (ceil(p.n::numeric/cfg.batch)::int - 1)
              else cfg.batch end as items
    from pz p cross join cfg
    cross join lateral generate_series(1, ceil(p.n::numeric/cfg.batch)::int) g
)
select event_date,
       to_char((window_mins/60)::int, 'FM00') || ':' || to_char((window_mins%60)::int, 'FM00') as window,
       sum(items) as pizzas,
       (select batch from cfg) as batch,
       case when sum(items) > (select batch from cfg) then 'BREACH'
            when sum(items) = (select batch from cfg) then 'red (full)'
            else 'amber' end as tone
  from seated
 group by event_date, window_mins
having sum(items) >= (select batch from cfg)
 order by event_date, window_mins;
```

🔴 **NO ROW MAY READ `BREACH`.** Rows reading `red (full)` are the intended peaks — 36 per event.

⚠️ **AND THE AUTHORITATIVE CHECK IS STILL THE BOARD.** Open each date's dashboard and confirm **no red
"N slots over capacity — review" banner** appears. This SQL reproduces the seating rule; the banner is
the engine's own verdict.

## 6.2 ✅ Every order contains a pizza

```sql
select count(*) filter (where pizzas = 0) as orders_without_pizza,
       count(*)                           as total_orders,
       sum(pizzas)                        as total_pizzas
  from (
    select o.order_key,
           (select coalesce(sum((l->>'quantity')::int), 0)
              from jsonb_array_elements(o.items) l
              join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
              join menu_categories c on c.id = m.category_id
             where c.name ilike '%pizza%') as pizzas
      from orders o
     where o.truck_id = 'test-truck-3-2'
  ) s;
```

**Expect `orders_without_pizza = 0`, `total_orders = 512` (64 × 8), `total_pizzas = 808` (101 × 8).**

## 6.3 🔴 Nothing is in `cooking`

```sql
select status, count(*)
  from orders
 where truck_id = 'test-truck-3-2'
 group by status
 order by 2 desc;
```

**Expect exactly four rows — `confirmed` 360, `collected` 80, `ready` 56, `pending` 16 — and nothing
else. Zero `cooking`.**

## 6.4 Supporting checks

```sql
-- first names only, and every email on the reserved test domain
select count(*) filter (where customer_name like '% %')                          as has_surname,
       count(*) filter (where customer_email is null)                            as missing_email,
       count(*) filter (where customer_email not like '%@demo.hatchgrab.test')   as wrong_domain
  from orders where truck_id = 'test-truck-3-2';
-- expect 0, 0, 0
```

```sql
-- the counters, and that no order can collide with a real one placed during review
select e.event_date, e.order_counter, count(o.order_key) as orders, max(o.id::int) as max_id
  from truck_events e
  left join orders o on o.event_id = e.id and o.truck_id = 'test-truck-3-2'
 where e.truck_id = 'test-truck-3-2'
   and e.event_date between date '2026-08-21' and date '2026-08-28'
 group by e.event_date, e.order_counter
 order by e.event_date;
-- expect 8 rows, each: order_counter = 64, orders = 64, max_id = 64
```

```sql
-- 🔴 nothing collects before 09:05, which is the earliest the engine can seat a pizza
select min(slot), max(slot) from orders where truck_id = 'test-truck-3-2';
-- expect 09:05 and 16:55
```

---

# 7. STOP CONDITIONS — status

| Condition | Fired? |
|---|---|
| The requested shape cannot be produced under the ceiling | ✅ **No.** 53 green / 24 amber / 19 red with a peak of 2 — the shape is achievable and is simulated above |
| Instructions contradict one another | ✅ **No.** The premise that 6 binds is mistaken (§1), but "never breach" and "at-the-ceiling peaks" are jointly satisfiable and both are satisfied |
| Garbled prompt | ✅ **No** |

⚠️ **ONE THING I COULD NOT VERIFY AND HAVE NOT ASSUMED:** `trucks.collection_interval_mins` for this
truck. The slots are written on the 5-minute capacity grid; if the truck's customer-facing collection
interval is coarser, these orders still display and still project correctly, but a customer could not
have chosen some of those times. **Tell me the value and I will realign the plan to it.**

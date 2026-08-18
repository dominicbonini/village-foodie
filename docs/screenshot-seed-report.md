# Thai Kitchen — App Store capture seed

**Truck** `test-truck` (slug `test-kitchen`) · **Event** 2026-08-21, The White Horse — Edwardstone, 16:30–20:00
**Deliverable** [scripts/seed-thai-kitchen-screenshots.sql](../scripts/seed-thai-kitchen-screenshots.sql) — 13 orders, hand-run.
**No SQL was executed.** Nothing was written to the database by this task.

## Assumed configuration (stated, and asserted by the script)

| Value | Assumed | Source |
|---|---|---|
| `truck_vans.kitchen_capacity` | **8** | correction 4 of the brief (raised from 2) |
| `truck_vans.capacity_window_mins` | **10** | correction 4 of the brief |
| Cooking category | **Mains**, `prep_secs = 300` (5 min), `batch_size = 5` | 🔴 **CONFIRMED AGAINST THE LIVE DB** — the script's own assertion fired on the first run and reported `batch_size = 5`, correcting the 4 assumed at design time. Redesigned against 5. |
| Other categories | `prep_secs = 0`, not ticked for capacity | inferred; **asserted** by the script |
| `collection_interval_mins` | 5 or 10 | **asserted** by the script |
| `slot_duration_mins` | 5 or 10 | **asserted** by the script |
| `order_counter` | **reset to 0 by the script** → first seeded order is #1 | PART 1 step 1b |

Every one of those is a `raise exception` in PART 1. If reality differs the transaction aborts and nothing is written.

---

# Stage 1 — read only

## Q1 · `lib/seed-demo-orders.ts` — what it writes, how it numbers, `source`, capacity

### What it writes

One `insert` of N rows into `orders`, then N parallel `increment_event_order_counter` RPCs:

```ts
    rows.push({
      id: String(rows.length + 1),
      truck_id: args.truckId,
      customer_name: CUSTOMER_NAMES[nameIdx++ % CUSTOMER_NAMES.length],
      customer_phone: null,
      customer_email: null,          // 🔴 see the file header — never populate this
      slot,
      order_type: 'collection',
      event_date: args.eventDate,
      event_id: args.eventId,
      items: lines,
      deals: [],
      discount_code: null,
      subtotal: total,
      discount_amt: 0,
      total,
      total_minor: toMinor(total),
      notes: null,
      status: 'confirmed',
      payment_status: 'unpaid',
    })
```

The `items` line shape, including the modifier convention:

```ts
  const lineFor = (src: MenuLine, quantity: number, seed: number) => {
    const modifiers = src.requiredMods.map((g, gi) => g.choices[pickIdx(seed, gi, g.choices.length)])
    // 🔴 unit_price INCLUDES the modifiers. That's the convention every real path stores
    // (trucks/[slug]/order/page.tsx:1093 — `menuItem.price + modifiers.reduce(...)`), and OrderLineItem
    // documents unitPrice as "base + modifiers".
    const unit_price = src.price + modifiers.reduce((a, m) => a + m.price, 0)
    return { name: src.name, quantity, unit_price, ...(modifiers.length ? { modifiers } : {}) }
  }
```

### How it numbers

Packed in shape-cycle order, then **relabelled** by collection time as the last step, then the counter is advanced `rows.length` times:

```ts
  rows.sort((a, b) => String(a.slot).localeCompare(String(b.slot)))
  rows.forEach((r, i) => { r.id = String(i + 1) })

  const { error } = await supabase.from('orders').insert(rows)
  …
  await Promise.all(
    Array.from({ length: rows.length }, () =>
      supabase.rpc('increment_event_order_counter', { p_event_id: args.eventId })),
  )
```

⚠️ It sets `id` **by hand** (`String(i + 1)`) and advances the counter **afterwards** so the two agree. That is legitimate for a demo truck starting from 0, but it is not the normal path.

### Does it set `source`?

**No.** `source` is absent from the row object entirely — seeded demo orders take the column default. So `seed-demo-orders.ts` gives me no precedent for the `('web','manual','whatsapp')` CHECK; I set it explicitly.

### Does it respect capacity?

**Yes — by construction, and only against the per-slot mains budget it invents itself.** It never calls the capacity engine:

```ts
    // 🔴 THE BREACH GUARD: a slot's budget NEVER exceeds the batch. Orders are packed within it below, so
    // no combination of order sizes can push a slot over the ceiling.
    const n = Math.min(Math.max(1, Math.round(ceiling * nonZero[i % nonZero.length])), ceiling, mainsLeft)
```

```ts
    const target = shape.mains > 0
      ? remaining.find(r => r.left >= shape.mains)
      : remaining.find(r => r.used > 0) ?? remaining[0]
    if (!target) continue      // no slot can take it — drop the order rather than breach
```

`ceiling` is `args.capacity`, passed in by the caller as "the MAINS BATCH". It caps **mains per collection slot**. It has no notion of cooking windows, of the backward spread, of `capacity_window_mins`, or of the global concurrency ceiling. It returns `peakPerSlot` so a breach of *its own* budget is provable — not a breach of the engine's.

### 🔴 Reuse verdict: **ADAPTED — its shapes reused, its planner not, and it is not the vehicle.**

**Reused verbatim as design constraints:** the `items` jsonb shape (`{name, quantity, unit_price, modifiers?}`), `unit_price` including modifiers, `customer_email` staying `null`, `deals: []`, `total_minor = round(total*100)`, `order_type: 'collection'`, and the requirement that every REQUIRED modifier group is filled (its "fix 5" — an empty required group renders as an incomplete line on the card). The SQL reproduces all of it.

**Not reused:** the FILL_PATTERN/stride planner and the hand-set `id`. Two reasons, both hard:

1. **Correction 2 forbids execution.** `seedDemoOrders` is a `SupabaseClient` function — running it *is* the database write. The deliverable had to be SQL, so the file could not be the vehicle whatever its shapes.
2. **Its ceiling is the wrong ceiling for this job.** It caps mains per *collection slot*; the brief asks for a controlled spread of tones, which is decided in *cooking windows* on the prep grid, by the backward spread. A 37-order stride pattern packed to a per-slot budget would land wherever it lands. This seed needs 5 mains at exactly two slots and 1–3 at four others — a placement the planner has no way to express.

Numbering is **not** copied: the SQL takes each `id` from `increment_event_order_counter(event_id)` inside the insert loop, which is what the real write paths do (`place_order_atomic`, migration 20260728:77). The brief asked for the normal path; `seed-demo-orders.ts` does not use it.

---

## Q2 · 🔴 The capacity engine's tone thresholds

`SlotTone` has **three** values — there is no fourth "over" tone:

```ts
// lib/slot-indicator.ts
export type SlotTone = 'green' | 'amber' | 'red'
```

The live engine is `projectBackwardOccupancy` (`lib/slot-availability.ts:659`). Every window's tone is decided by exactly two rules, in this order:

```ts
      // Per-category batch tone (PREP grid) — UNCHANGED: full/over ⇒ red, partial ⇒ amber
      // (worst wins, tie-break higher load).
      let tone: SlotTone = 'green'
      …
      for (const [cat, used] of Object.entries(byCat)) {
        const batch = batchByCat[cat]
        if (batch == null) continue
        remainingByCat[cat] = batch - used
        const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
        …
      }
      // Global ceiling for the no-basket display = EXACT concurrency at this window's instant
      // (cooking spanning + instant points), not a per-window sum.
      const conc = concurrencyAt(intervals, startMins)
      if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
        tone = 'red'; bound_by = 'global ceiling'
      }
```

So, exactly:

| Tone | Condition |
|---|---|
| **GREEN** | the window carries no counted load at all — no cooking category present, and no ticked-instant points. `byCat` empty ⇒ the loop never runs ⇒ `tone` stays `'green'`. |
| **AMBER** | at least one cooking category present with `0 < used < batch`, **and** `concurrencyAt(intervals, start) < kitchen_capacity`. |
| **RED** | **either** some category has `used >= batch` (batch full — `bound_by = "Mains 4/4"`) **or** `concurrencyAt(...) >= kitchen_capacity` (`bound_by = 'global ceiling'`). |

A green tone can never be painted over real load, and amber can never be painted over an empty window — the `too_soon → amber` fold was deleted (reference manual, "amber means real load only").

### 🔴 What makes a slot OVER — and why it is not a tone

**Over-capacity is a separate, strictly-greater test.** `tone` cannot express it, stated in the engine's own words:

```ts
  /** Units this window is STRICTLY OVER the kitchen_capacity ceiling; 0 when it is at-or-under.
   *
   *  `tone` alone cannot express this: it goes red at `conc >= ceiling` (slot-availability.ts:737),
   *  so a legitimately FULL window and a genuinely over-subscribed one render identically. This is
   *  the same strictly-over test the breach detector applies (`remainingTotal < -EPS`,
   *  lib/capacity-breach.ts:100) — full is not over. */
  overTotal: number
```

```ts
    const overTotal = w && w.remainingTotal < -1e-9 ? Math.round(-w.remainingTotal) : 0
```

There are three ways a slot goes over, and the seed must avoid all three:

1. **`remainingTotal < 0`** — `conc > kitchen_capacity`. Renders the `!` marker beside the dot in `DayLoadStrip`.
2. **`remainingByCat[cat] < 0`** — `used > batch` in one window. Reachable only when two production slots' backward spreads collide on the same window key; a single deadline never seats more than `batch` per window.
3. **Run-off-front / `cantFit`** — a cohort needing a cooking window before event start. Piles into the event-start dot as `bound_by = 'over capacity at event-start'`:

```ts
        if (used > batch + EPS) overflowed = true                          // needs >1 window ⇒ true pile-up
      …
      if (tone === 'red' && overflowed) bound_by = 'over capacity at event-start'
```

**The seed produces a spread of the first three tones and none of the fourth condition.** Verified below.

---

## Q3 · 🔴 How many mains fit one window before RED, and before OVER

**First, the correction the arithmetic turns on: the cooking grid is 5 minutes, not 10.**

`capacity_window_mins = 10` does **not** set the cooking-window cadence. The cooking grid is the **prep** cadence:

```ts
  // step = PREP grid (cooking window keying + the no-basket single-window lookup). UNCHANGED.
  const step = backwardWindowStepMins(catConfigs)
  // capacityStep = the global ceiling's OWN cadence (capacity_window_mins): where instant counted
  // items seat and roll. Independent of prep — closes the "borrow the fastest prep" gap and the
  // no-cooking-category collapse.
  const capacityStep = Math.max(1, Math.round(capacityWindowMins))
```

```ts
export function backwardWindowStepMins(catConfigs: Record<string, CatConfig>): number {
  let step = Infinity
  for (const cfg of Object.values(catConfigs)) {
    if (cfg && cfg.secs) step = Math.min(step, Math.max(1, Math.round(cfg.secs / 60)))
  }
  return Number.isFinite(step) ? step : 0
}
```

With Mains at `prep_secs = 300`, **`step = 5`**. `capacityStep = 10` is used only to seat *instant items the operator ticked toward capacity* — and on this truck there are none. **Executed and confirmed:** the harness prints `backwardWindowStepMins = 5`.

### The numbers

| Span | RED at | OVER at |
|---|---|---|
| **One 5-minute cooking window** | **5 mains** (`used >= batch`, `bound_by = "Mains 5/5"`) | **6 mains** (`remainingByCat.mains = -1`) |
| **One 10-minute span** (two consecutive 5-min windows) | **10 mains** — both windows red | **11 mains** |
| **Global ceiling** (`kitchen_capacity = 8`) | never reached — see below | never reached |

### 🔴 The finding: at batch 5, `kitchen_capacity = 8` is inert

The ceiling is judged by `concurrencyAt`, which counts only intervals *covering* the instant:

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

Cooking intervals are `[startMins, startMins + prepMins)` — here `[W, W+5)` on a 5-minute grid. An interval starting at `W−5` ends at `W`, **exclusive**, so it does not cover `W`. Therefore `concurrencyAt(intervals, W)` equals **exactly the mains seated in window W**, which the per-category rule already caps at 5 before it can ever reach 8.

**Raising `kitchen_capacity` from 2 to 8 changes nothing about these tones.** With `batch_size = 5` and `prep_secs = 300`, the binding constraint is the Mains batch, at 5. The ceiling would only bind again if it were set **below 5**, or if a second cooking category ran concurrently. This is stated because the brief's premise was that 8 would be the governing number; it is not.

**Executed sensitivity check** (same 13 orders, engine re-run):

| `prep_secs` / `batch_size` | green | amber | red | **over** |
|---|---|---|---|---|
| 300 / 2 | 16 | 2 | 4 | **0** |
| 300 / 4 | 16 | 4 | 2 | **0** |
| **300 / 5** ← CONFIRMED, and what the seed is built for | **16** | **4** | **2** | **0** |
| 300 / 6 | 16 | 6 | 0 | **0** |
| 300 / 8 | 16 | 6 | 0 | **0** |
| 600 / 4 | 16 | 4 | 2 | **0** |
| 600 / 8 | 16 | 6 | 0 | **0** |

The rows above 300/5 are the pre-correction sweep, re-listed unchanged; **no configuration produces an over-capacity slot.** The seed is safe even if the config assumption is wrong; only the red/amber split moves.

---

## Q4 · How prep time maps an item to a cooking window

Two separate mappings, and they use **different** step values. This is the subtlety the brief is pointing at.

### (a) Seating — each category spreads backward at its OWN prep cadence

```ts
      const batch = Math.max(1, cfg.batch)
      const prepMins = Math.max(1, Math.round(cfg.secs / 60))
      batchByCat[cat] = batch
      const numWindows = Math.ceil(N / batch)
      const earliestWindowMins = deadline - numWindows * prepMins
      if (earliestWindowMins < eventStartMins) {
        cantFit.push({ productionSlot: ps, cat, qty: N, earliestWindowMins, eventStartMins })
      }
      // Seat batches backward on the PREP grid (UNCHANGED): earliest windows full (batch), the
      // window ADJACENT to collection holds the remainder N − batch*(numWindows-1) ∈ [1, batch].
      // Each window is ALSO a [S, S+prep) concurrency interval for the global sweep.
      for (let i = 0; i < numWindows; i++) {
        const startMins = deadline - (numWindows - i) * prepMins
        const isAdjacent = i === numWindows - 1
        const items = isAdjacent ? N - batch * (numWindows - 1) : batch
```

`deadline` is the production-slot key, which is the collection time bucketed down by `slot_duration_mins`:

```ts
    const ct = order.slot || eventStart
    if (!ct) return
    const productionSlot = timeMap[ct] || ct
```

```ts
  for (let mins = start; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
```

So: **N items of category C, collected at T, occupy `ceil(N/batch_C)` windows of width `prep_C`, ending at T.** The window adjacent to collection is `[T − prep_C, T)` and holds the remainder; earlier windows hold a full batch each.

**This is exactly why two orders at the same collection slot may not share a window.** Category C's adjacent window is `T − prep_C`; category D's is `T − prep_D`. Different prep, different key, and the per-window map keys by exact minute — *"the per-window map keys by exact window-start minute, so differing cadences accumulate honestly by minute."*

### (b) Display — the dot reads ONE window, keyed by the MINIMUM prep

```ts
    const w = back.pileByStart.get(slotM) ?? back.byStart.get(slotM - step) ?? null
    const tone: SlotTone = w?.tone ?? 'green'   // engine's tone: batch denominator + capacity ceiling
```

with `step = backwardWindowStepMins(catConfigs)` — the **minimum** prep across all cooking categories. So the dot at collection time T always reads the window starting `T − min(prep)`. On a multi-prep menu a slower category's adjacent window (`T − prep_slow`) is a *different* key and is read by a *different, earlier* dot. **On this truck there is one cooking category, so `step = prep_Mains = 5` and the two coincide** — the dot at T reads `[T−5, T)`, the exact window the order's remainder lands in. That is what makes this seed's tones predictable.

---

# Stage 2 — the seed

## 🔴 This is the demo seeder's own planner, reproduced — not a hand-drawn board

At your instruction the board is now built at **demo density** by running
`lib/seed-demo-orders.ts`'s planner arithmetic verbatim for this event. Nothing about the algorithm was
invented or tuned: same constants, same cycle, same stride, no randomness.

| Step | Source constant | Result here |
|---|---|---|
| First collection | `FIRST_COLLECTION_OFFSET_MINS = 10` | 16:30 + 10 = **16:40** |
| Slot grid | `SLOT_INTERVAL_MINS = 5` | **41 slots**, 16:40 → 20:00 |
| Target | `max(4, min(37, round(slots × 37/35)))` | `min(37, round(41 × 1.057)) = ` **37 orders** |
| Shapes | `ORDER_SHAPES` 12-cycle | **43 mains + 51 accompaniments = 94 item lines** |
| Ceiling | `args.capacity` = the MAINS BATCH | **5** (`menu_categories.batch_size`) |
| Budgets | `round(ceiling × FILL_PATTERN)` over `[1, .5, 1, .25, .75]` | **`[5,3,5,1,4,5,3,5,1,4,5,2]`** — 12 budgets, sum 43 |
| Stride | `slots.length / budgets.length` | `41 / 12 =` **3.4167** |
| Placement | `round(j × stride)`, never double-booking | 16:40, 16:55, 17:15, 17:30, 17:50, 18:05, 18:25, 18:40, 18:55, 19:15, 19:30, 19:50 |
| Packing | first slot whose remaining budget ≥ the order's mains | **37 placed, 0 dropped** |
| Renumber | sort by slot, `id = i + 1` | #1 collects first |

**Executed planner output:**

```
slots=41 (16:40..20:00)  target=37  totalMainsNeeded=43
budgets(12)=[5,3,5,1,4,5,3,5,1,4,5,2]  sum=43  stride=3.4167
planned: 16:40:5 16:55:3 17:15:5 17:30:1 17:50:4 18:05:5 18:25:3 18:40:5 18:55:1 19:15:4 19:30:5 19:50:2
orders placed=37  dropped=0  peakPerSlot=5  (ceiling 5)
```

🔴 **`peakPerSlot = 5 = ceiling`, which is the seeder's own breach guard doing its job.** Because a slot
never holds more than one batch, every loaded slot seats into exactly ONE cooking window (`D − 5`), the
12 loaded slots are ≥ 10 minutes apart so no two share a window, and **no window can be over-subscribed
by construction.** That is the same guarantee the seeder's comment claims — and here it is also the
engine's guarantee, because the seeder's ceiling and the engine's per-category batch are the same number.

## 🔴 The script clears the event before it seeds

At your instruction PART 1 now deletes first. Step 1b removes **every order on this one event**, drops that
event's cached occupancy, and resets its `order_counter` to 0 — so the first seeded order is #1 without
anyone setting a number by hand.

```sql
  select count(*) into v_existing from orders where event_id = v_event_id;
  delete from orders where event_id = v_event_id;
  delete from production_slot_usage where truck_id = v_truck and event_id = v_event_id;
  update truck_events set order_counter = 0 where id = v_event_id;
```

Three properties worth stating plainly, because this is the destructive part:

- **Scope is one `event_id`, not a truck or a date range.** `v_event_id` is resolved from
  (truck, date, venue, not-cancelled) before anything is deleted, so no other event, no other truck and no
  past event is reachable by these statements.
- **It is inside the same transaction as the insert.** If any later assertion fails — or the insert does —
  the deletes roll back with it and you are left exactly where you started.
- **`order_payments` cascades.** It carries `references orders(order_key) on delete cascade`
  (`20260729_order_payments_ledger.sql:57`) and is the **only** FK to `orders`, so its rows go automatically
  and the delete cannot fail on a constraint.

PART 0d prints the count that will be deleted, so you can see it before you run PART 1.

## Two deliberate deviations from the seeder, both stated

1. **Statuses are not all `confirmed`.** The seeder sets every row to `'confirmed'` ("a pile of unactioned
   cards reads as a backlog"). That would leave the **Done** counter at zero and give the board no history.
   Statuses here are assigned by a single cut at the collection time, so the board reads as a service caught
   mid-flow: **before 17:50 → `collected`; 17:50 → `ready`; 18:05 onward → `confirmed`, with 5 `pending`.**
2. **The pools are deterministically ordered.** The seeder's item select carries no `ORDER BY`, so
   `mainsPool[pick % len]` depends on whatever order Postgres returns. The SQL orders both pools by name, so
   the same script run twice produces the same board. Nothing else about the pick arithmetic changed —
   including the modifier chooser, `pickIdx = (pick × 31 + groupIdx × 17 + 7) % len`.

## Names, sources, dishes

**First names only**, from the seeder's own `CUSTOMER_NAMES` list, cycled exactly as it cycles them (37
orders over 20 names, so some recur — as they do on a real demo board). Every 4th order is a walk-up taken
at the hatch: **9 `Walk-up` / `manual`, 28 first-name / `web`.** No surnames, no real person's name.

🔴 **No dish is named in the script.** The pools are read from the live menu the way the seeder reads them —
every active item in the cooking category is a "main", every active item in an instant category is an
"extra" — so the script **cannot fail on a dish name**, and `price` always comes from the live book.
PART 0c prints both pools in the exact order the seed will index them.

## The 37 orders

| # | Slot | Status | Source | Customer | Mains | Extras | Note |
|---|---|---|---|---|---|---|---|
| 1 | 16:40 | collected | web | Sarah | 1 | 0 |  |
| 2 | 16:40 | collected | web | Dave | 1 | 1 |  |
| 3 | 16:40 | collected | web | Priya | 1 | 2 |  |
| 4 | 16:40 | collected | manual | Walk-up | 2 | 1 | No coriander please |
| 5 | 16:40 | collected | web | Tom | 0 | 2 |  |
| 6 | 16:40 | collected | web | Aisha | 0 | 2 |  |
| 7 | 16:40 | collected | web | Mark | 0 | 2 |  |
| 8 | 16:55 | collected | manual | Walk-up | 1 | 1 |  |
| 9 | 16:55 | collected | web | Chloe | 1 | 2 | Mild for the kids |
| 10 | 16:55 | collected | web | Raj | 1 | 1 |  |
| 11 | 17:15 | collected | web | Ellie | 2 | 2 |  |
| 12 | 17:15 | collected | manual | Walk-up | 1 | 2 |  |
| 13 | 17:15 | collected | web | Ben | 1 | 0 |  |
| 14 | 17:15 | collected | web | Nadia | 1 | 0 |  |
| 15 | 17:30 | collected | web | Jack | 1 | 1 |  |
| 16 | 17:50 | ready | manual | Walk-up | 2 | 3 | One without peanuts - allergy |
| 17 | 17:50 | ready | web | Sophie | 1 | 2 |  |
| 18 | 17:50 | ready | web | Omar | 1 | 1 |  |
| 19 | 18:05 | pending | web | Grace | 2 | 1 |  |
| 20 | 18:05 | confirmed | manual | Walk-up | 1 | 2 |  |
| 21 | 18:05 | pending | web | Liam | 2 | 2 |  |
| 22 | 18:25 | confirmed | web | Yasmin | 1 | 1 |  |
| 23 | 18:25 | confirmed | web | Callum | 1 | 2 |  |
| 24 | 18:25 | confirmed | manual | Walk-up | 1 | 0 | Extra spicy on the curry |
| 25 | 18:40 | confirmed | web | Freya | 2 | 3 |  |
| 26 | 18:40 | pending | web | Idris | 1 | 0 |  |
| 27 | 18:40 | confirmed | web | Sarah | 1 | 1 |  |
| 28 | 18:40 | pending | manual | Walk-up | 1 | 2 |  |
| 29 | 18:55 | confirmed | web | Dave | 1 | 1 |  |
| 30 | 19:15 | confirmed | web | Priya | 2 | 1 |  |
| 31 | 19:15 | confirmed | web | Tom | 1 | 2 | Collecting for a table of four |
| 32 | 19:15 | confirmed | manual | Walk-up | 1 | 1 |  |
| 33 | 19:30 | confirmed | web | Aisha | 2 | 2 |  |
| 34 | 19:30 | confirmed | web | Mark | 1 | 2 |  |
| 35 | 19:30 | pending | web | Chloe | 1 | 0 |  |
| 36 | 19:30 | confirmed | manual | Walk-up | 1 | 0 |  |
| 37 | 19:50 | confirmed | web | Raj | 2 | 3 |  |

30 multi-line orders, 7 single-line, 3 drinks-only (#5–#7, the seeder's one-per-cycle shape, attached to the
busiest slot in play), 5 with a note. **First seeded order is #1** — the counter is 0, asserted, and every
`id` comes from `increment_event_order_counter`.

---

# 🔴 Verification

## Verified by EXECUTION

The planner was executed (a verbatim transcription of the seeder's arithmetic, importing the real
`generateSlots`), and its output was then fed to the **real engine modules** — `lib/slot-availability.ts`
(`projectBackwardOccupancy`), `lib/slot-display.ts` (`buildSlotIndicators`), `lib/slot-generation.ts` —
imported through jiti with the `@/` alias resolved. **No database.** `production_slot_usage` is computed by
transcribing `buildUnitsFromOrders`' per-order loop including its status filter, which is the one piece the
harness reproduces rather than calls, because that function needs a `SupabaseClient`.

```
CONFIG kitchen_capacity=8 capacity_window_mins=10 mains prep=300s batch=5 interval=5 slot_duration=5
backwardWindowStepMins = 5 min  (a slot at T reads the cooking window starting T-5)
production_slot_usage: {"18:05":{"mains":5,...},"18:25":{"mains":3,...},"18:40":{"mains":5,...},
                        "18:55":{"mains":1,...},"19:15":{"mains":4,...},"19:30":{"mains":5,...},
                        "19:50":{"mains":2,...}}

COOKING WINDOWS (projectBackwardOccupancy):
  win 18:00  byCat={"mains":5}  conc=5  tone=RED   bound_by=Mains 5/5  remainingByCat={"mains":0} remainingTotal=3
  win 18:20  byCat={"mains":3}  conc=3  tone=AMBER bound_by=Mains 3/5  remainingByCat={"mains":2} remainingTotal=5
  win 18:35  byCat={"mains":5}  conc=5  tone=RED   bound_by=Mains 5/5  remainingByCat={"mains":0} remainingTotal=3
  win 18:50  byCat={"mains":1}  conc=1  tone=AMBER bound_by=Mains 1/5  remainingByCat={"mains":4} remainingTotal=7
  win 19:10  byCat={"mains":4}  conc=4  tone=AMBER bound_by=Mains 4/5  remainingByCat={"mains":1} remainingTotal=4
  win 19:25  byCat={"mains":5}  conc=5  tone=RED   bound_by=Mains 5/5  remainingByCat={"mains":0} remainingTotal=3
  win 19:45  byCat={"mains":2}  conc=2  tone=AMBER bound_by=Mains 2/5  remainingByCat={"mains":3} remainingTotal=6
cantFit = []
pileByStart entries = 0
```

### Slot tones — every loaded slot (all others GREEN)

| Slot | Tone | `overTotal` | Label |
|---|---|---|---|
| **18:05** | 🔴 **RED** | 0 | 5 Mains |
| **18:25** | 🟡 **AMBER** | 0 | 3 Mains |
| **18:40** | 🔴 **RED** | 0 | 5 Mains |
| **18:55** | 🟡 **AMBER** | 0 | 1 Mains |
| **19:15** | 🟡 **AMBER** | 0 | 4 Mains |
| **19:30** | 🔴 **RED** | 0 | 5 Mains |
| **19:50** | 🟡 **AMBER** | 0 | 2 Mains |

```
TALLY  green=36 amber=4 red=3   SLOTS STRICTLY OVER CAPACITY = 0
WINDOWS with negative remaining (over-subscribed) = 0
COUNTERS  New=5  Confirmed=17  Done=15   (total 37)
source values in seed: ["web","manual"]  all in ('web','manual','whatsapp') = true
```

**Grid robustness, executed:**

| `interval` / `slot_duration` | green | amber | red | **over** |
|---|---|---|---|---|
| **5 / 5** ← the grid this plan was built on | 36 | 4 | 3 | **0** |
| 5 / 10 | 36 | 4 | 3 | **0** |
| 10 / 10 | 15 | 4 | 3 | **0** |

No slot goes over on any grid; the 12 planned slots never merge into one bucket.

- ✅ **Slot tones per slot** — engine output above.
- ✅ **No slot is over capacity** — `overTotal = 0` everywhere, `remainingByCat`/`remainingTotal` non-negative
  in all 7 loaded windows, `cantFit = []`, `pileByStart` empty, on every grid tested.
- ✅ **The three counters are all non-zero** — New 5, Confirmed 17, Done 15.
- ✅ **`source` values satisfy the CHECK** — `["web","manual"]`.
- ✅ **`peakPerSlot = 5`, never above the ceiling** — the planner's own guarantee, re-measured.

## Verified by SOURCE ONLY

- **The counter buckets** — `app/dashboard/[token]/page.tsx:2786-2792`, rendered New / Confirmed / Done at `:3298`.
- **The KDS board rule and grid cap** — `kds/page.tsx:1588`, `:1635-1642`.
- **That the SQL runs.** Not executed; no SQL was run. One transaction with `raise exception`
  preconditions, so a wrong assumption aborts everything rather than half-seeding.
- **No order attributed to a real person** — by inspection of the name list above.

## 🔴 Flags

1. 🔴 **THE KDS GRID CAP AND DEMO DENSITY ARE MUTUALLY EXCLUSIVE, AND I HAVE CHOSEN DENSITY.**
   The earlier brief asked for a KDS board "under the 8-item grid cap". A 37-order service leaves **22**
   orders on the board (everything not collected/cancelled/rejected), so the **grid** layout shows 8 and a
   **"+14 more"** chip. There is no way to have both: capacity load requires non-collected statuses, and
   non-collected statuses are exactly what the board counts. **The escape is the layout, not the seed** —
   `kds/page.tsx:1637-1642` caps only `activeLayout === 'grid'`; the **list layout is uncapped and shows no
   overflow chip**. Capture the KDS in list layout and both requirements hold at once.
2. **`kitchen_capacity = 8` is still inert** at `batch_size = 5` (Q3). Peak concurrency reached by this seed
   is 5. The ceiling would only bind if set below 5.
3. **`ready` sits in the Confirmed bucket**, not Done — so Done is carried by the 15 `collected` orders.
4. **Capture timing.** The status cut assumes a capture at roughly **18:00 on 21 August**. `DayLoadStrip`
   hides past slots only when the event is today: captured on the day at 18:00 the strip shows 18:00→20:00
   with **7 of ~25 slots coloured, 3 of them red**; captured earlier, the whole 16:30→20:00 strip renders and
   the early history reads as overdue. Move the cut if you capture at a different time.
5. **Three drinks-only orders (#5–#7) all sit at 16:40.** That is the seeder's own rule
   (`remaining.find(r => r.used > 0) ?? remaining[0]`), not a bug — reproduced rather than corrected.

---

# Integrity

## Byte-level scan

Run with a byte-level Python pass (`open(path,'rb')`, integer comparison against the flagged set), **not** grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

### First scan (post-write, taken after the one `0e` edit to the SQL)

| File | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR |
|---|---|---|---|---|---|
| `scripts/seed-thai-kitchen-screenshots.sql` | 21666 | 0 | 0 | **0** | 0 / 387 / 0 |
| `lib/truck-logo.ts` | 1640 | 0 | 0 | **0** | 0 / 28 / 0 |

Non-ASCII class census, before:

| File | Count | Distinct | Classes |
|---|---|---|---|
| `…seed-thai-kitchen-screenshots.sql` | 923 | 4 | 780 × U+2550 So BOX DRAWINGS DOUBLE HORIZONTAL · 127 × U+2500 So BOX DRAWINGS LIGHT HORIZONTAL · 15 × U+2014 Pd EM DASH · 1 × U+2192 Sm RIGHTWARDS ARROW |
| `lib/truck-logo.ts` | 3 | 2 | 2 × U+2014 Pd EM DASH · 1 × U+1F534 So LARGE RED CIRCLE |

### Second scan (independent re-run, after this report was written)

```
--- scripts/seed-thai-kitchen-screenshots.sql  bytes=21666
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=387 CR(0x0D)=0
    non-ASCII chars=923 distinct=4
        780  U+2550 So BOX DRAWINGS DOUBLE HORIZONTAL
        127  U+2500 So BOX DRAWINGS LIGHT HORIZONTAL
         15  U+2014 Pd EM DASH
          1  U+2192 Sm RIGHTWARDS ARROW
--- lib/truck-logo.ts  bytes=1640
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 LF(0x0A)=28 CR(0x0D)=0
    non-ASCII chars=3 distinct=2
          2  U+2014 Pd EM DASH
          1  U+1F534 So LARGE RED CIRCLE
--- docs/screenshot-seed-report.md   (final state, this file)
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0 CR(0x0D)=0   (LF only)
    non-ASCII distinct=16
         68  U+2014 Pd EM DASH
         34  U+00D7 Sm MULTIPLICATION SIGN
         16  U+1F7E2 So LARGE GREEN CIRCLE
         13  U+1F534 So LARGE RED CIRCLE
          9  U+00B7 Po MIDDLE DOT
          9  U+2212 Sm MINUS SIGN
          7  U+2013 Pd EN DASH
          6  U+2026 Po HORIZONTAL ELLIPSIS
          5  U+2192 Sm RIGHTWARDS ARROW
          5  U+21D2 Sm RIGHTWARDS DOUBLE ARROW
          4  U+1F7E1 So LARGE YELLOW CIRCLE
          4  U+2705 So WHITE HEAVY CHECK MARK
          3  U+26A0 So WARNING SIGN
          3  U+FE0F Mn VARIATION SELECTOR-16
          1  U+2190 Sm LEFTWARDS ARROW
          1  U+2208 Sm ELEMENT OF
```

⚠️ **Self-reference caveat, stated rather than fudged.** This report cannot print its own byte length or
LF count inside itself: writing the number changes the file, which changes the number. The figures above
are the ones that are stable under an ASCII-digit edit — the flagged-byte counts (the thing that matters:
**zero**) and the non-ASCII class census. The byte length and LF count were measured on the final file and
reported in chat, not embedded here.

⚠️ **Honest note on "before and after":** the SQL file was written once and then edited once (the `0e`
preflight block). The first scan above was taken **after** that edit, so it is not a pre-edit baseline —
the two scans are the same file state, re-measured independently. **Both scans are identical on every
count for all three files. Zero flagged control bytes in any file, at any point. No file required
sanitisation, and none was performed.** The only non-ASCII in the SQL is box-drawing rule characters,
em dashes and one arrow, all inside `--` comments; the only non-ASCII in `lib/truck-logo.ts` is two em
dashes and one 🔴 in a comment.

## Carrier-aware variation-selector check on this report

Per emoji-presentation base: occurrences **bare** versus occurrences **followed by U+FE0F**.

```
CARRIER-AWARE VARIATION-SELECTOR CHECK — docs/screenshot-seed-report.md
total U+FE0F in file: 3
BASE          BARE  +FE0F  NAME
U+1F534          13      0  LARGE RED CIRCLE
U+26A0            0      3  WARNING SIGN
U+1F7E2          16      0  LARGE GREEN CIRCLE
U+1F7E1           4      0  LARGE YELLOW CIRCLE
U+2705            4      0  WHITE HEAVY CHECK MARK
TOTAL            37      3
```

Reading it: the four bases that are `Emoji_Presentation=Yes` by default (U+1F534, U+1F7E2, U+1F7E1,
U+2705) are **100% bare** — 37 of 37 — which is correct; a VS-16 on them is redundant. The single
`Emoji_Presentation=No` base, U+26A0 WARNING SIGN, is **100% paired** — 3 of 3 — which is also correct;
without VS-16 it would render as a monochrome text glyph. **The file is internally consistent: no base
appears both bare and paired.**

## `git status --porcelain`

```
 M docs/reference-manual.md
 M lib/truck-logo.ts
?? docs/screenshot-seed-report.md
?? scripts/seed-thai-kitchen-screenshots.sql
```

**`M docs/reference-manual.md` was already there before this task began** — it is the sole entry in the
session's opening git snapshot, and nothing in this task touched it.

The other three are this task's own work:
- `M lib/truck-logo.ts` — the separate logo fix you asked for mid-task (below).
- `?? docs/screenshot-seed-report.md` — this report.
- `?? scripts/seed-thai-kitchen-screenshots.sql` — the seed.

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or
`git restore` was run at any point.**

---

# Appendix — the header logo fix (separate request)

You reported mid-task that the logo still appears in the header after being removed in Settings.

**Cause.** `resolveTruckLogo` (`lib/truck-logo.ts`) was the single source for the header logo on all four
surfaces (dashboard, manage, menu, order). When `trucks.logo_storage_path` was null it fell back to
`discovery_trucks.logo_url`. Clearing the logo in Settings writes exactly that null — which is the state
the fallback was written to rescue — so removal could never be visible.

**Fix applied** (your choice: drop the fallback entirely). `lib/truck-logo.ts` now returns the uploaded
logo or `null`, with no discovery query. One file; the four call sites are untouched, and the function
keeps its signature so nothing else changed. `tsc --noEmit` reports no error involving this file.

⚠️ **Stated consequence:** a truck that never uploaded a logo now shows **no** logo in the operator
header and on the customer order page, where it previously borrowed its Village Foodie discovery mark.
"Removed" and "never uploaded" are the same database state, so no fallback can honour both — the
setting the operator can actually reach wins. Recoverable by uploading a logo.

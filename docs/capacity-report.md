# Over-capacity warning — READ-ONLY diagnostic

**Date:** 28 July 2026 · **Case:** Pizzeria Gusto, 28 July, event 17:00–20:00, Van1 `kitchen_capacity=2`, `capacity_window_mins=5`
**Nothing was changed.** No code written, no files touched except this report. No commands run beyond reads.

> **REVISED — later the same day.** Three things changed since the first pass. §0's prep/batch inference is now **confirmed** by you. Q3's unknown contributing orders are now **named** (#9 and #14). §6's `counts_toward_capacity` inference is **confirmed false for every category** — and that turned out not to mean what it looks like (new **§7**). Two new sections cover the customer-path fit check and why #14 at 18:30 is unexplained (**§8**), and a premise I accepted without verifying that may invalidate that whole line of enquiry (**§9**). Q1–Q6 below are otherwise unchanged; where a later section supersedes one, it says so.

---

## ⚠️ FLAGGED — garbled spans in the prompt

Two spans do not parse. Not silently repaired; my reading is stated so you can correct it. Neither changed an answer.

| Span as written | Read as |
|---|---|
| "The **operaooking** at the orders, it was NOT obvious why 18:20 was over." | "The **operator, looking** at the orders, …" |
| "(b) merely the order whose collection slot equals the named window,**mething else?**" | "…, or **(c) so**mething else?" |

---

## 0 · The one value everything rests on — ~~inferred~~ **CONFIRMED**

**`pizza` is `prep_secs = 300` (5 min), `batch_size = 2`.**

*First pass:* inferred, because I had no DB access. Three of your observations pinned it — the panel showing **4** at 18:20, the banner reporting **exactly one** slot over, and the reason being **`global ceiling`** rather than `Pizza 4/2`. `prep=5, batch=2` reproduced all three; `prep=10,batch=2` · `prep=10,batch=4` · `prep=10,batch=3` · `prep=15,batch=2` each failed at least one (panel label of 2, or a concurrency of 6, or 3). I did not exhaustively search the space.

*Now:* **you have confirmed `prep_secs=300`, `batch_size=2` directly.** The inference is retired — every number below is arithmetic on confirmed values. `capacity_window_mins=5` and `kitchen_capacity=2` were given by you throughout.

---

## Q1 — IS THE WARNING CORRECT?

### **CORRECT-BUT-MISLEADING.**

The arithmetic is right. The window really does hold 4 units against a ceiling of 2. The **attribution** is what misleads: the banner names order #10, and #10 supplies only half the load.

### The exact computation

`app/api/dashboard/route.ts:382` calls `detectCapacityBreaches`, which runs the same projection the strip and dots use — `lib/capacity-breach.ts:73-79`:

```ts
  const back = projectBackwardOccupancy(
    productionSlotUnits || {},
    catConfigs || {},
    eventStartMins,
    kitchenCapacity,
    Math.max(1, Math.round(capacityWindowMins ?? 5)),
  )
  const step = backwardWindowStepMins(catConfigs || {})
```

For each collection slot it reads the cooking window **ENDING** at that slot — `lib/capacity-breach.ts:96`:

```ts
    const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
```

and flags it only when strictly over — `:100-105`:

```ts
    const overTotal = w.remainingTotal < -BREACH_EPS ? -w.remainingTotal : 0
    ...
    if (overTotal <= 0 && overCats.length === 0) continue   // full is fine; only genuine over-subscription flags
```

`remainingTotal` is `kitchenCapacity − conc` (`lib/slot-availability.ts:747`), where `conc = concurrencyAt(intervals, startMins)` (`:736`) — a **sweep line**, counting every cooking interval covering that instant (`:524-532`):

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

Intervals come from the backward seating loop — `lib/slot-availability.ts:665-684`:

```ts
      const batch = Math.max(1, cfg.batch)
      const prepMins = Math.max(1, Math.round(cfg.secs / 60))
      batchByCat[cat] = batch
      const numWindows = Math.ceil(N / batch)
      ...
      for (let i = 0; i < numWindows; i++) {
        const startMins = deadline - (numWindows - i) * prepMins
        const isAdjacent = i === numWindows - 1
        const items = isAdjacent ? N - batch * (numWindows - 1) : batch
        const w = loadByStart.get(startMins) ?? {}
        w[cat] = (w[cat] || 0) + items
        loadByStart.set(startMins, w)
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
      }
```

### By hand, against your data

`step = 5`. Collection slot **18:20** → window keyed **18:15**.

Seating every stored deadline (pizza), `batch=2`, `prep=5`:

| Stored slot (deadline) | N | windows = ⌈N/2⌉ | seats at (items) |
|---|---|---|---|
| 17:50 | 1 | 1 | 17:45 (1) |
| 17:55 | 2 | 1 | 17:50 (2) |
| 18:00 | 2 | 1 | 17:55 (2) |
| 18:05 | 1 | 1 | 18:00 (1) |
| 18:15 | 4 | 2 | 18:05 (2), 18:10 (2) |
| **18:20** | **2** | **1** | **18:15 (2)** |
| **18:30** | **5** | **3** | **18:15 (2)**, 18:20 (2), 18:25 (1) |
| 18:45 | 6 | 3 | 18:30 (2), 18:35 (2), 18:40 (2) |
| 18:55 | 3 | 2 | 18:45 (2), 18:50 (1) |
| 19:00 | 2 | 1 | 18:55 (2) |
| 20:00 | 2 | 1 | 19:55 (2) |

**Window 18:15** carries two intervals, both `[18:15, 18:20)`:

```
  2 items — the single batch for the 2 pizzas due at 18:20      (order #10)
+ 2 items — the FIRST of three batches for the 5 pizzas due at 18:30
──
  concurrencyAt(intervals, 18:15) = 4
```

```
remainingTotal  = kitchenCapacity − conc = 2 − 4 = −2   →  −2 < −1e-9  →  over_total = 2
remainingByCat  = batch − used          = 2 − 4 = −2   →  over_cats = [{ pizza, 2 }]
```

`bound_by` is set to `Pizza 4/2` by the per-category loop (`:730`), then **overwritten** by the ceiling check (`:737-739`):

```ts
      const conc = concurrencyAt(intervals, startMins)
      if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
        tone = 'red'; bound_by = 'global ceiling'
      }
```

→ `reason: 'global ceiling'`. Rendered by `components/dashboard/CapacityBreachBanner.tsx:41-47` as
`⚠ 1 slot over capacity — review` / `18:20 — global ceiling (orders #10)`. **Character-for-character what you saw.**

### Every other window checks out as not-breached

| Window | conc | `2 − conc` | Flagged? |
|---|---|---|---|
| 17:45 | 1 | 1 | no |
| 17:50 / 17:55 / 18:05 / 18:10 | 2 | 0 | no — **full is not over** (`:105`) |
| 18:00 / 18:25 / 18:50 | 1 | 1 | no |
| **18:15** | **4** | **−2** | **YES** |
| 18:20 / 18:30 / 18:35 / 18:40 / 18:45 / 18:55 / 19:55 | 2 | 0 | no |

Exactly one breach. The "1 slot" count is right.

### Which units land in 18:15, and whose they are

| Units | From stored slot | Whose order |
|---|---|---|
| 2 | 18:20 | **order #10** (1 Marinara + 1 Inferno Delight, collection 18:20) — named in the banner |
| 2 | 18:30 | the order(s) collecting at **18:30** — **not named anywhere** |

Order #10 is not over-subscribed. 2 pizzas at a ceiling of 2 is exactly full. It became a breach because a **different, later** order's cooking reaches backward into the same five-minute window. That is why it was not obvious from looking at the orders: the other half of the load belongs to a ticket ten minutes further down the board.

---

## Q2 — WHY 4 AND NOT 2?

**Neither "packing/spilling when full" nor "deriving independently from orders".** The panel reads a **different quantity from a different key**: not `production_slot_usage['18:20']`, but the accumulated cooking-window load at `18:20 − step`.

`production_slot_usage` stores **ready-by deadlines** — `lib/slot-availability.ts:640`:

```ts
    const deadline = parseMins(ps) // bucket START = ready-by deadline (see reconciliation note)
```

The engine then seats each deadline's items **backward** across `⌈N/batch⌉ × prep` minutes (loop quoted in Q1, `:676-684`). Two different deadlines can therefore write into the same window: an order needing 3 windows reaches back 15 minutes and lands in windows that belong, by name, to earlier collection slots.

The panel's per-row number is `s.label`, built in `lib/slot-display.ts:92` and `:97-109`:

```ts
    const w = back.pileByStart.get(slotM) ?? back.byStart.get(slotM - step) ?? null
```
```ts
    const label = w
      ? Object.entries(w.byCat)
          .filter(([, n]) => Math.round(Number(n)) > 0)
          .sort(([a], [b]) => rankOf(a) - rankOf(b))
          .map(([cat, rawN]) => {
            const count = Math.round(Number(rawN))
```

and is rendered verbatim by `components/dashboard/DayLoadStrip.tsx:84-86`. `DayLoadStrip` computes nothing — its own header says so (`:8`: *"NO capacity computation here"*).

So `w.byCat['pizza']` at window 18:15 = `2` (from deadline 18:20) `+ 2` (first batch of deadline 18:30) = **4**, while `production_slot_usage['18:20']` = `{pizza: 2}`. Two different quantities, both correct for what they measure:

- **stored 2** = "2 pizzas must be READY by 18:20"
- **panel 4** = "4 pizzas are IN THE OVEN during 18:15–18:20"

The transform is deterministic backward seating by prep/batch cadence, **not** overflow. Nothing spills because a window is full — the seating never consults the ceiling. `lib/slot-display.ts:73-75` states it directly:

> *projectBackwardOccupancy seats each order's load BACKWARD into its cooking windows by batch/prep cadence — driven purely by batch/prep, INDEPENDENT of collection_times/production_window_key (pooling-free).*

And `lib/slot-availability.ts:428` on the negative remainder:

> *Negative ⇒ honest over-subscription (override) — NOT re-packed.*

One consequence worth stating: the panel row is **labelled with the collection time (18:20) but describes the window 18:15–18:20**. The window's own `startMins` / `start` fields exist on `BackwardWindow` (`lib/slot-availability.ts:417-421`) and are never displayed.

---

## Q3 — WHY DOES IT NAME ORDER #10?

**(b) — merely the order whose collection slot string equals the named window.** It is not the tipping order, and no attempt is made to identify one.

`lib/capacity-breach.ts:84-90`:

```ts
  const ordersBySlot = new Map<string, Array<{ order_key: string; id: number }>>()
  for (const o of orders || []) {
    if (!o || !o.slot || !o.order_key || !OCCUPYING_STATUSES.has(o.status)) continue
    const arr = ordersBySlot.get(o.slot) ?? []
    arr.push({ order_key: o.order_key, id: o.id })
    ordersBySlot.set(o.slot, arr)
  }
```

`lib/capacity-breach.ts:107`:

```ts
    const grp = ordersBySlot.get(s.collection_time) ?? []
```

A plain string equality on `o.slot === '18:20'`. The field's own doc comment (`:41`) says exactly what it is — *"order_keys of OCCUPYING orders collected at this slot"* — which is a truthful description of a list that does not answer the question the banner poses.

The mismatch is structural: **orders are grouped by collection slot; load is measured per cooking window**, and those are different partitions of the same units. An order contributes to `⌈N/batch⌉` windows, only the last of which shares its collection time.

### The orders whose units are in the 18:15 window

| Units in window 18:15 | Collection slot | Named by the banner? |
|---|---|---|
| 2 | **18:20** — order **#10** (2 pizzas, placed 11:10) | ✅ yes |
| 2 | **18:30** — the first batch of the 5 pizzas there: **#9** (3 pizzas, placed 09:57) **+ #14** (2 pizzas, placed 15:21) | ❌ **no** |

**That second row is the missing information.** *(First pass: I could not name those orders. You have since supplied them — #9 and #14.)* Note the second row cannot be attributed to a single order even in principle: the 5 pizzas at 18:30 are an aggregate of #9 and #14, and `production_slot_usage` sums them before the engine ever sees them, so the 2 units that spill into 18:15 belong to **both** orders jointly. The banner would need to name three orders — #10, #9, #14 — and it names one.

The code *had* the `orders` rows in hand at the moment it decided (see Q5); it filtered them out by exact slot match.

Two further consequences of the same string match:

- If **no** order has `slot === '18:20'` (e.g. every contributing order collects later), `order_ids` is `[]` and `CapacityBreachBanner.tsx:45` renders the breach with **no order reference at all**.
- Conversely an order at 18:20 that contributes **nothing** to the breached window would still be named.

---

## Q4 — CAN THE TWO VIEWS DISAGREE?

**They read the same data through the same engine, but apply different thresholds over different scopes — and, more importantly, two of the three write paths do not consult it at all. Yes, an order can be accepted and then shown over-capacity.**

### Same source, same engine

Customer submit reads `production_slot_usage` via `getProductionSlotUnits` (`app/api/orders/submit/route.ts:257`) and calls `earliestBackwardFitSlot` (`:287`), which runs `fitOrderBackward` — the same `projectBackwardOccupancy` output and the same `concurrencyAt` sweep. **The data never diverges.**

### Different threshold, different scope

Breach detection — `lib/capacity-breach.ts:100`, every window, **strictly over**:

```ts
    const overTotal = w.remainingTotal < -BREACH_EPS ? -w.remainingTotal : 0
```

Submit's fit — `lib/slot-availability.ts:972-988`, **only windows the new order occupies**, and *at* the ceiling is accepted:

```ts
  if (kitchenCapacity != null) {
    const realIntervals = [...back.intervals, ...orderCookIntervals]
    const cookingPeak = windowScopedPeak(realIntervals, orderCookIntervals)
    if (cookingPeak > kitchenCapacity + EPS) {
      consider('red', 'global ceiling')
    } else {
      ...
        if (peak >= kitchenCapacity - EPS) consider('amber', 'global ceiling')
```

`windowScopedPeak` (`:545-564`) evaluates only instants inside the order's own cooking spans. `lib/slot-availability.ts:960-971` documents the narrowing as deliberate: *"an unrelated earlier over-capacity window … must NOT block a later genuinely-fitting slot."*

So the customer path can accept into an event that already contains a breach elsewhere — by design. It cannot, on its own, accept an order that would push a window **it touches** over 2.

### The paths that skip the check entirely

**1 — operator walk-up. No server capacity gate at all.** `app/api/dashboard/action/route.ts:763-766`:

```ts
      // Walk-up / manual orders ALWAYS confirm (Section 5): the operator is present and
      // knows the queue, so the manual path bypasses auto_accept and ALL capacity gating
      // (that gate lives only on the customer path / claimAvailableSlot). The order still
      // occupies the oven via addOrderToProductionSlot below — confirm always, occupy always.
```

The only check is client-side in `components/dashboard/AddOrderPanel.tsx:690`, and it is an overridable prompt that **fails open** (`:709`):

```ts
      } catch { /* FAIL OPEN — a flaky check must never block a manual order */ }
```

**2 — operator edit. No capacity check at all.** The edit handler in `app/api/dashboard/action/route.ts` re-books production slots without ever calling the fit engine. (Confirmed by reading the handler; stock guards and the booking lock are likewise absent there and are known, deliberate gaps.)

### The explicit answer

**Yes.** An order can be accepted by one path and then shown over-capacity by the banner. Conditions, in order of likelihood for this case:

1. **Operator walk-up or override at 18:20.** No server gate; the client prompt is dismissible and fail-open. Most probable explanation for #10 given `18:20` and `18:30` both being loaded — **INFERRED**, I cannot see how #10 was created.
2. **Operator edit** moving an order onto 18:20 or 18:30, or increasing its quantity. Ungated.
3. **Ordering effect on the customer path.** If the 18:30 order was placed **first** into an empty board, its first batch peaked at exactly 2 in window 18:15 → `>= ceiling` → **amber, accepted** (`:986`). A later customer order at 18:20 would then peak at 4 in a window it touches → red → **not** accepted. So the customer path alone cannot produce this state — but it *can* produce the amber half of it.
4. **Offline sync collision.** The documented original purpose of the banner — `components/dashboard/CapacityBreachBanner.tsx:8-10`.

---

## Q5 — WHAT INFORMATION EXISTS BUT ISN'T SHOWN?

### Known at the moment the 18:20 breach is decided

Inside `detectCapacityBreaches`, at `lib/capacity-breach.ts:100`, in scope:

| Fact | Value here | Where it lives |
|---|---|---|
| Cooking window start | **18:15** | `w.startMins` / `w.start` (`slot-availability.ts:417-421`) |
| Window composition | `{ pizza: 4 }` | `w.byCat` (`:424`) |
| Actual concurrency | **4** | `w.total` (`:426`) |
| Ceiling | **2** | `kitchenCapacity` param (`capacity-breach.ts:53`) |
| Overage vs ceiling | **2** | `w.remainingTotal = −2` → `over_total` (`:100`) |
| Per-category overage | `pizza −2` (batch 2, used 4) | `w.remainingByCat` → `over_cats` (`:102-104`) |
| Both binding reasons | `Pizza 4/2` **and** `global ceiling` | computed at `slot-availability.ts:730` then overwritten at `:738` |
| Every stored deadline + qty | the full 11-row usage map | `productionSlotUnits` param (`capacity-breach.ts:51`) |
| **Every order** with slot, id, key, status | incl. the 18:30 orders | `orders` param (`:57`) |
| Prep/batch cadence | 5 min / 2 | `catConfigs` param (`:52`) |

### What reaches the UI

The breach object carries six fields (`lib/capacity-breach.ts:108-115`). The banner renders **three** — `components/dashboard/CapacityBreachBanner.tsx:44-47`:

```tsx
          {breaches.map(b => {
            const ids = b.order_ids.length ? ` (orders ${b.order_ids.map(i => `#${i}`).join(', ')})` : ''
            return `${b.collection_time} — ${b.reason}${ids}`
          }).join('  ·  ')}
```

| Fact | Captured on the breach? | Reaches the operator? |
|---|---|---|
| `collection_time` 18:20 | ✅ | ✅ |
| `reason` `global ceiling` | ✅ | ✅ |
| `order_ids` `[10]` | ✅ | ✅ |
| `over_total` **2** | ✅ `:111` | ❌ **computed, transported, never rendered** |
| `over_cats` `[{pizza, 2}]` | ✅ `:112` | ❌ **computed, transported, never rendered** |
| `order_keys` | ✅ `:113` | ❌ not rendered (banner has no link/anchor) |
| Window start **18:15** | ❌ dropped | ❌ |
| Window composition `{pizza:4}` | ❌ dropped | ⚠️ only as the panel's separate "4" — never joined to the banner |
| Concurrency **4** | ❌ dropped | ❌ |
| Ceiling **2** | ❌ dropped | ❌ |
| Superseded reason `Pizza 4/2` | ❌ overwritten `:738` | ❌ |
| **Orders at 18:30 contributing 2 units** | ❌ filtered out `:107` | ❌ **the missing fact** |

`over_total` and `over_cats` are the sharpest gap: both are computed, rounded, attached to the payload and shipped to the browser, and no component reads them. They appear only inside `breachSignature` (`CapacityBreachBanner.tsx:18`), where they are used to decide whether a dismissed banner should re-show — never displayed.

### One fact that is genuinely NOT available, and why

**Which order each unit in the window came from is not recoverable from the engine's output.** `CookInterval` carries no provenance — `lib/slot-availability.ts:480-487`:

```ts
export interface CookInterval {
  /** Start minute (inclusive). */
  startMins: number
  /** End minute (exclusive for cooking; == startMins for a zero-width instant point). */
  endMins: number
  /** Counted items present across [startMins, endMins). */
  items: number
}
```

The source deadline `ps` is in hand inside the seating loop (`:639-684`) and is discarded when the interval is pushed. Per-**order** provenance is never present at all: `production_slot_usage` is a per-slot **aggregate**, so by the time load reaches the engine the individual orders have already been summed away.

So the distinction is: the **stored slot** (18:30) that contributed the other 2 units is reconstructible from data already in scope (`productionSlotUnits` + `catConfigs`); the **order** behind it is reconstructible only from the `orders` param, which is also in scope. Neither reconstruction is attempted.

### Two adjacent findings, same layer

- **Only windows aligned to a collection slot are ever checked.** `lib/capacity-breach.ts:93-96` iterates `times` and looks up `slotMins − step`. A breached window that no collection slot maps to is never examined. Does **not** apply here (18:15 is reachable from 18:20 with `step=5`), but with a coarser collection grid than the prep cadence it would be.
- **The banner reports a collection time, never a window.** "18:20" names a slot at which nothing is over; the over-subscription is in 18:15–18:20. Both strings exist in the engine's output.

---

## Q6 — ARE NON-COOKED CATEGORIES EXCLUDED FROM THE CEILING?

**Not automatically. It is per-category and operator-controlled — `menu_categories.counts_toward_capacity`, default `false`.** Ceiling and panel label move together: a no-prep category either counts for both or neither.

`lib/slot-availability.ts:646-663`:

```ts
      if (!cfg || N <= 0) continue
      if (!cfg.secs) {
        // No prep cadence. Counts toward the ceiling only if the operator ticked it.
        if (cfg.countsToCapacity) {
          instantHere += N                          // CEILING path — feeds the concurrency points / sweep (UNCHANGED).
          ...
          const ws = deadline - capacityStep
          const w = loadByStart.get(ws) ?? {}
          w[cat] = (w[cat] || 0) + N
          loadByStart.set(ws, w)
        }
        continue
      }
```

- `!cfg.secs` and **not** ticked → `continue`. No `instantHere`, no `loadByStart` write. **Excluded from both the ceiling and the panel label.**
- `!cfg.secs` and ticked → counted in the ceiling *and* written to `byCat`, so it **does** appear in the label ("2 Drinks").

Flag source — `lib/prep-utils.ts:186-190`:

```ts
      catConfigs[c.name.toLowerCase()] = {
        secs: c.prep_secs || 0,
        batch: c.batch_size && c.batch_size > 0 ? c.batch_size : 999,
        countsToCapacity: !!c.counts_toward_capacity,
      }
```

Column default — `supabase/migrations/20260610_category_counts_toward_capacity.sql`:

```sql
alter table menu_categories
  add column if not exists counts_toward_capacity boolean not null default false;
```

> *"Default false preserves today's behaviour (0-prep categories count nothing). No backfill."*

### For your 18:00 row (`{pizza:2, drinks:2, desserts:1}`) — **CONFIRMED**

You have since confirmed `counts_toward_capacity = false` for **every** category on this truck. So Drinks and Desserts contribute nothing: window 17:55 = `{pizza: 2}`, conc 2, label "2 Pizzas". The 2 drinks and 1 dessert are invisible to both the ceiling and the label. My first-pass reasoning ("the banner reported exactly one breached slot, so the no-prep categories aren't counting") held.

**Correction to the question's framing:** the panel's per-row number is **not** "cooked items only". It is `w.byCat`, which includes ticked no-prep categories. `lib/slot-display.ts:43-44` states the intent — *"byCat is already capacity-counted-only (unticked no-prep excluded)"*. Capacity-counted, not cooked.

⚠️ **But `counts_toward_capacity = false` for Pizza does NOT mean Pizza is excluded — see §7.** That reading is the trap, and the UI actively encourages it.

---

## 7 · The flag is bypassed entirely for any category with `prep_secs > 0`

`counts_toward_capacity` is `false` for Pizza, yet Pizza demonstrably drove a breach. Both facts are correct: **the flag is never consulted for a prep-bearing category.**

Line **647** — `if (!cfg.secs)` — is the only gate. `countsToCapacity` is read at **649**, *inside* that branch. Pizza has `cfg.secs = 300`, so `!cfg.secs` is `false`, the whole block at 647-664 is skipped, and control reaches 665, which seats cooking batches and pushes concurrency intervals unconditionally (`:683`):

```ts
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
```

Those intervals **are** the ceiling — `intervals` is seeded from them (`:692`) and the ceiling test is `concurrencyAt(intervals, startMins)` (`:736-739`). The flag is never read on that path. Mirrored in the fit path at `:904-906`.

Four exits, precisely:

| `cfg` | Counts toward ceiling? | Where |
|---|---|---|
| missing, or `N <= 0` | no — contributes nothing at all | `:646` `continue` |
| `secs` falsy, flag **false** | no | `:647` + `:663` `continue` |
| `secs` falsy, flag **true** | yes, as instant concurrency points | `:649-661` |
| **`secs > 0`** | **yes, always — flag never read** | `:665-683` |

Stated design, not drift — `supabase/migrations/20260610_category_counts_toward_capacity.sql`:

> *"Prep-bearing categories (prep_secs > 0) ignore it and always count (their prep/batch IS the capacity rule), enforced in the engine."*

and `lib/demo-assumptions.ts:92`: *"Cooked categories are auto-counted by the engine (prep_secs > 0 forces counts_toward_capacity)."* Consistent with `lib/go-live-checks.ts:170`, which treats either condition as capacity-bearing.

**What the flag is actually for:** an opt-in for **zero-prep** categories only — sides, dips, drinks. They have no prep cadence, so the engine has no intrinsic reason to seat them; the flag says "these still occupy the hatch." They seat as bare concurrency points at `deadline − capacityStep`, with no batch denominator and no per-category tone (`:657`).

**UI that sets it:** two operator surfaces, both writing the same column — Dashboard → Settings capacity grid (`app/dashboard/[token]/page.tsx:2764-2774` → `toggleCatCapacityDash` → `update_category` → `app/api/dashboard/action/route.ts:1394-1399`), and Manage → categories (`app/manage/[token]/page.tsx:8122-8129` → `toggleCatCapacity` → `upsert_category` → `app/api/manage/route.ts:256-270`). Both write only when explicitly provided, so a prep/batch save can't clear it.

### 🔴 The display trap

`app/dashboard/[token]/page.tsx:2744-2746`:

```ts
                        const hasCap=kitchenCapacity!=null
                        const locked=(catObj.prep_secs??0)>0
                        const capDisabled=locked||!hasCap||!activeEvent.van_id||isOffline
```

`:2770` renders the checkbox **ticked regardless of the stored value** when the category is cooked, and disables it:

```tsx
                                checked={locked?true:!!catObj.counts_toward_capacity}
```

tooltip (`:2766`): *"Cooked — always counts (its prep & batch set the pace)"*.

So for Pizza the dashboard shows a **ticked, greyed** box while the database stores **`false`**. The checkbox is asserting engine behaviour; the column is storing something the engine ignores. Anyone reading the column directly sees `false` and reasonably concludes Pizza shouldn't count. Not a bug — but the column and the checkbox mean different things for cooked categories, and nothing on the row says so.

---

## 8 · The customer-path fit check, and why #14 at 18:30 is unexplained

Orders on this event, as supplied: **#9** 3 pizzas @ 18:30 (placed 09:57) · **#10** 2 pizzas @ 18:20 (11:10) · **#14** 2 pizzas @ 18:30 (15:21).

### Does the check re-seat the post-add aggregate? **No — it seats only the incoming order.**

`app/api/orders/submit/route.ts:287` → `earliestBackwardFitSlot` (`lib/slot-availability.ts:1018-1027`) → `fitOrderBackward`, which iterates `orderByCat` — the incoming basket alone (`:899-935`) — with `nw = Math.ceil(M / batch)` on the **new** order's `M`. Existing load enters only as pre-projected intervals (`:973`):

```ts
    const realIntervals = [...back.intervals, ...orderCookIntervals]
    const cookingPeak = windowScopedPeak(realIntervals, orderCookIntervals)
```

The aggregate **is** passed, as `existingAtSlot` (`:1023` → `:887`), but it is consumed **only** by the lead check at `:925` (`loadRunsOffFront`) — never by the ceiling or batch computation.

**Consequence, and it is real:** `windowScopedPeak` (`:545-562`) evaluates only instants inside the order's own cooking spans — the windows it occupies **under solo seating**. That is not the window set it occupies once merged into the slot aggregate. #14 solo = 1 batch at 18:25. Merged (5 pizzas @ 18:30) = 3 batches at 18:15/18:20/18:25. **Window 18:15 is never evaluated at fit time.** That is precisely why the breach only surfaced afterwards: `production_slot_usage` stores the aggregate `18:30 → 5`, so the *next* projection re-seats it as 3 batches reaching back to 18:15.

### #14 by hand — and it should have been REJECTED

Existing #9 (3 pizzas @ 1110), `nw = ⌈3/2⌉ = 2` (`:676-683`): intervals `[1100,1105)` items 2 and `[1105,1110)` items 1.
Incoming #14 (2 pizzas @ 1110), `nw = ⌈2/2⌉ = 1` (`:926-934`): interval `[1105,1110)` items 2.

`windowScopedPeak` → instants `{1105}`. `concurrencyAt` (`:528`, half-open):

```
  [1100,1105)              1100 ≤ 1105 < 1105 is FALSE   →  +0
  [1105,1110)  existing                                  →  +1
  [1105,1110)  #14                                       →  +2
  ──────────────────────────────────────────────────────────
                                             conc = 3  >  2
```

`3 > 2 + EPS` → `consider('red', 'global ceiling')` (`:975-976`). The per-category test agrees independently (`:949-956`): `combined = 1 + 2 = 3 > batch 2` → red, `Pizza 3/2`.

**Doubly red. `fits = false` at 18:30.**

So the hypothesis that seat-only-incoming let #14 through is **refuted as the explanation**: the mechanism is real, but the sweep-line still catches #9's adjacent batch at 18:25 and rejects. The incremental model changes *which window is named* (18:25 vs 18:15), not the verdict. The aggregate model would also have rejected.

### Accept threshold (`:972-993`)

**Amber accepts** — `conc == ceiling` is explicitly amber, not red. **Red rejects that slot**, never the order: `earliestBackwardFitSlot` walks forward, and if nothing fits, `submit/route.ts:288-291` returns `booked: false` → the order is inserted **pending at the requested slot with no capacity booked** (`p_unit_rows = null`).

### The lock — clean

The check is **inside** the lock and **freshly read**. `acquireEventLock` at `submit/route.ts:724`; `placeOrderInSlotLocked` called at `:789`; the occupancy read at `:257` — *"One FRESH read under the event lock — we are the sole writer for its duration."* Two concurrent customer orders at one slot cannot both pass. **No stale-pre-lock race.**

### What the customer saw

The `/api/slots` list uses the **no-basket display branch** (`lib/slot-availability.ts:179-186`): window 18:25 held only #9's adjacent batch (`{pizza:1}`, conc 1) → **amber → `available: true`**. The list offered 18:30.

The customer page then layers a basket-aware hard block on top (`app/trucks/[slug]/order/page.tsx:1024-1043`) using the same `fitOrderBackward` — which *would* have blocked 18:30, but only if its `/api/slots` snapshot (fetched once, `:392`) already contained #9's pizzas.

### Remaining candidates for how #14 landed at 18:30

Since the fit returns red, one of these must hold. I could not discriminate:

1. **`startEntry` miss** — `submit/route.ts:249-253`: a requested slot absent from `times` returns `{ finalSlot: startSlot, booked: true }` with **no capacity check at all**.
2. **`booked: false` → pending.** #14 inserted pending at 18:30, nothing booked; its units entered `production_slot_usage` later via `rebuildProductionSlotUsage`, which counts `pending` (`lib/slot-bookings.ts:226`). **"Accepted" would mean "not rejected", not "passed".**
3. **`slotUnits` lacked `18:30 → {pizza:3}` at 15:21** — e.g. #9 was itself unbooked.
4. **#14 was not a web order at all** — see §9. This is now the leading candidate.

Discriminating queries: #14's `status` (`pending` ⇒ 2); whether `collection_times` has an `18:30` row (⇒ 1); #9's status/booking (⇒ 3); #14's `van_id` (⇒ 4).

---

## 9 · 🔴 The order-channel premise was never verified — and cannot be, from the column the UI uses

§8 was built on "all orders `source='web'`, none edited", which I **took from the prompt and did not check**. You have since said the evening shows a mix of walk-up and online orders. That premise is load-bearing and it is now in doubt.

### There is no `orders.source` column

`source` exists in exactly two places, neither of which is order channel:

- `orders.items[].source` — set **only** by the customer path (`app/trucks/[slug]/order/page.tsx:1131`, `source: (b as any).source || 'direct'`), and it means *upsell provenance*.
- `truck_events.source` — `'manual'` for operator-created events (`app/api/dashboard/action/route.ts:633`).

Whatever surface labels orders "walkup" vs "online" is **deriving** it. `app/api/manage/route.ts:1248-1249` says so:

```ts
      // customer_email used client-side to infer order type: null = operator-placed, set = customer online
      // No source/is_manual column exists yet — customer_email IS NULL is the best available signal.
```

**That inference fails in one direction.** A walk-up where the operator typed the customer's email for a receipt (`AddOrderPanel` offers the field; `action/route.ts:862` stores `customerEmail || null`) is classified as **online**. The reverse cannot happen — the customer path hard-requires an email (`submit/route.ts:325`). So misclassification only ever moves walk-ups *into* the "web" bucket — exactly the direction that would hide a walk-up among #9/#10/#14.

### Reliable discriminators, strongest first

| Signal | Web (customer) | Walk-up (operator) | Where |
|---|---|---|---|
| **`van_id`** | set from `eventRow.van_id` | **never set → NULL** | `submit:901` vs `action/route.ts:859-872` (no `van_id` key) |
| **`items[].cartKey`** | absent | **present** on every line | `order/page.tsx:1125-1132` vs `AddOrderPanel.tsx:561` |
| **`items[].source`** | **present** | absent | `order/page.tsx:1131` |
| `customer_email` | always non-null | usually null, **not guaranteed** | `submit:325` vs `action:862` |
| status at insert | `pending` or `confirmed` | **always `confirmed`** | `submit:872` vs `action:871` |

`van_id` is cleanest here — Van1 is assigned, so every genuine web order on this event has it populated. `cartKey` is the strongest per-row confirmation, with the caveat that **the edit path also writes cartKey**, so it only implies walk-up for an order never edited (`status='modified'` would show it).

```sql
select id, status, van_id, customer_email,
       items->0 ? 'cartKey' as has_cartkey,
       items->0 ? 'source'  as has_source
from orders
where event_id = '<the 28 July event>'
order by created_at;
```

`van_id IS NULL` **and** `has_cartkey` ⇒ walk-up.

### Why this matters

**If #14 was a walk-up, §8's puzzle dissolves entirely.** The manual path runs **no server capacity check** (`app/api/dashboard/action/route.ts:763-766` — *"bypasses auto_accept and ALL capacity gating"*), with only the dismissible, fail-open client prompt at `AddOrderPanel.tsx:690-709`. An operator adding 2 pizzas at 18:30 sees "this slot is already booked up — use it anyway?" and OK writes it straight through.

Two consequences for the rest of this report:

- **Q1–Q3 and §7 stand regardless of order origin.** They are about `production_slot_usage`, which is a per-slot aggregate — it does not record which path wrote it. The seat-only-incoming finding and the never-evaluated 18:15 window are also origin-independent.
- **§8's line of enquiry is the wrong one to pursue** if #14 turns out to be a walk-up. Check `van_id` on #14 first.

**#9 and #10's origin is irrelevant to #14's arithmetic** — existing load is existing load once it reaches `production_slot_usage`. Only #14's own origin decides whether any check ran.

---

## What I could not verify

**Resolved since the first pass:** `menu_categories` prep/batch for Pizza (§0, confirmed by you) · `counts_toward_capacity` across all categories (§6/§7, confirmed false) · the contributing 18:30 orders (Q3 — #9 and #14).

**Still open:**

1. **The channel of every order on this event** — and, per §9, it is **not** readable from any `source` column, because none exists. The label you are looking at is inferred from `customer_email IS NULL` and silently misclassifies a walk-up that carries an email. Run the §9 query.
2. **How #14 landed at 18:30**, given the fit returns red (§8). Four candidates, undiscriminated. Check `van_id` on #14 first.
3. **How order #10 was created** — same question, same query. Q4's ranking is reasoning about which paths *can* produce this state, not evidence about which one did.
4. **Whether #9 was booked or pending** at 15:21 — decides §8 candidate 3.
5. **The collection-slot grid** — I assumed `times` carries every 5-minute slot. If it is coarser, more windows go unexamined (the finding at the end of Q5), and §8 candidate 1 becomes live.
6. **Nothing was executed.** No `next dev`, no `next build`, no queries, no test harness. Every number in this report is hand-arithmetic against the quoted code and the usage map you supplied.
7. **`pileByStart`** — irrelevant here (keyed by `eventStartMins` = 17:00, so it only affects the event-start slot), but I did not trace it in full.

### One premise I should have flagged and didn't

§8 was answered on "all orders `source='web'`, none edited" **as given**, without checking whether that was knowable. It wasn't — there is no such column. I should have said so before building an analysis on top of it rather than after.

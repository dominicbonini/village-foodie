# Seeding queued orders from the outbox, and labelling the stock badge

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed: `app/dashboard/[token]/page.tsx`, `components/dashboard/AddOrderPanel.tsx`.**

---

## VERIFICATION

**EXECUTION.** Part One measured with the **real `buildOfflineOccupancy`, `slot-bookings` and `outbox`
modules** under Node — **8 assertions, 0 failing**, with the failing case shown failing first. A wrong
assertion of mine (category keys are lowercased) was caught by the suite and corrected.

**`npx tsc --noEmit` clean — SANITY ONLY, not verification.**

🔴 **NEITHER SURFACE WAS EXERCISED.** `proxy.ts:305` gates `/manage`, and the dashboard is token-gated —
**I have no session, so I have not opened the board, taken an order, force-quit, or seen either new
string rendered.** §9 is the runbook.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 A CORRECTION TO MY PREVIOUS REPORT, FIRST

**`docs/offline-stock-report.md` said item stock does not count down offline. That was half wrong, and
the half I missed matters.**

**`app/dashboard/[token]/page.tsx:2917-2937` — `offlineConsumedByItem` / `offlineConsumedByCat`** folds
`deviceQueuedOrders` into the displayed `orders_count`. Its own comment: *"so remaining ticks down as the
operator takes orders offline."* **I did not find it because I traced the server path and the panel's
props, and never checked whether the dashboard adjusts the counts between them.**

**The true picture:**

| Surface | Does remaining tick down offline? |
|---|---|
| **Menu & Stock list** (`:4773`, `:4829` apply the fold) | ✅ **YES** |
| 🔴 **Add-order panel** (`:4089` passes **raw** `itemStocks`) | ❌ **NO** |

> 🔴 **So two surfaces on the same screen disagree offline**, and the one that disagrees is the one the
> operator composes orders on. ⚠️ **I have NOT wired the fold into the panel** — that is exactly the
> "local tally" item 9 withholds approval for, and its blind spots are real. **Reported as a finding.**

---

# PART ONE — seeding `deviceQueuedOrders`

## 1 · Where, and how an op becomes an order

**Seeded in a mount-only effect in `app/dashboard/[token]/page.tsx`, immediately above the existing prune
effect**, guarded on `isNativeApp()` (web has no outbox).

**The conversion reads the op's own queued body — the authoritative copy of what was sent, and the same
object `AddOrderPanel` built its optimistic card from, so the two cannot diverge:**

| `buildOfflineOccupancy` needs | Taken from |
|---|---|
| `order_key` | `op.order_key` |
| `event_id` | `body.manualOrder.event_id` |
| `slot` | `body.manualOrder.slot` |
| `items`, `deals` | `body.manualOrder.items` / `.deals` |
| `status` | **`'confirmed'`** — it must be in `OCCUPYING` (`slot-capacity.ts:39`) or the fold ignores it |

**Plus the fields the board and `queuedPayment` read** — `id` (from `op.provisional_id`), `customer_name`,
`total`, `subtotal`, `notes`, `payment_status` (from `manualOrder.paymentTaken`), `created_at` (from
`op.client_ts`) — because `deviceQueuedOrders` also feeds `pendingQueued` (`:3034`), which **renders order
cards**. A minimal object would have produced blank cards.

## 2 · 🔴 Deduplication — on `order_key`, at four layers, and three already existed

| # | Layer | Where |
|---|---|---|
| 1 | Skip anything already in `prev` (onOrderPlaced may have added it this session) | **new**, in the seed |
| 2 | 🔴 **`const syncedKeys = new Set(serverOrders.map(o => o.order_key))` … `queuedOrders.filter(o => !syncedKeys.has(o.order_key))`** | **`lib/slot-capacity.ts:40-41` — already existed** |
| 3 | The prune effect drops synced twins from the list entirely | `page.tsx:1393-1397` |
| 4 | `pendingQueued` filters the board's display list on the same keys | `page.tsx:3034` |

> ✅ **Layer 2 is the one that matters and it predates this change** — an op that drained while the device
> missed the confirmation is dropped by `order_key` before it can be folded twice. **Measured.**

**Two filters on top, both about not inventing load:**

- **`kind === 'create'` only** — a status/stock/buzzer op is not an order.
- **`state !== 'conflict'`** — a dead-lettered op will never become a server order, so folding it would
  hold oven capacity against an order that is never made.

## 3 · How a seeded op leaves the list

**The prune effect at `:1393-1397`, unchanged:** when an order's `order_key` appears in the server
`orders` array it is filtered out of `deviceQueuedOrders`. **Plus layer 2 above, which stops it counting
even in the window before the prune runs.**

> ✅ **So the fold empties as ops drain, and capacity returns to server truth.** **Measured: with the
> synced twin in `serverOrders`, the seeded copy contributes nothing.**

## 4 · Does the KDS have the same gap? — **No**

**`grep` on `app/dashboard/[token]/kds/page.tsx` returns zero hits for `deviceQueuedOrders`,
`buildOfflineOccupancy` and `offlineOccupancy`, and it has no capacity surface** (the only `capacity`
match is a comment about re-booking). **It does not consume the fold, and walk-ups are created on the
dashboard, not the KDS.** ✅ **Nothing to change there.**

## 5 · The measurement

| Case | Result |
|---|---|
| 🔴 **Cold mount, 2 ops queued, NO seed** | **folds 0 units — capacity overstated. THE BUG, REPRODUCED** |
| With the seed | ✅ **5 units folded** |
| Split across windows | ✅ `12:00 → 3`, `12:30 → 2` |
| 🔴 **An op whose twin is already in `serverOrders`** | ✅ **counted ONCE (5, not 8)** |
| A `status` op | ✅ not folded as an order |
| A `conflict` (dead-lettered) create | ✅ not folded |
| Once the twin syncs | ✅ the queued copy drops out |
| | ✅ **8 assertions, 0 failing** |

⚠️ **The seed's mapping is MIRRORED in the harness, not imported** — it lives in a React effect. **The
fold, the dedup and the outbox are the real modules.**

---

# PART TWO — the stock badge

## 6 · Which convention I followed — and 🔴 the one you named does not exist

**You asked me to follow how capacity labels itself advisory. It doesn't.** `grep` for
*advisory/estimated/approx* across `AddOrderPanel.tsx` and `DayLoadStrip.tsx` returns **four hits, all in
code comments**. **Capacity shows traffic lights and says nothing to the operator about their status.**

> **So there was no convention to copy, and I did not invent a second one. I followed the DEGRADED-BAR
> convention the dashboard already uses for stale data** — *"Can't reach the server. Showing orders from
> HH:MM."* — which is the same OfflineBanner family §8 points at: **name the time, state what may be
> wrong, claim nothing.**

**Mechanism:** a new `stockFetchFailed` flag (set in `fetchStock`'s previously-silent `.catch(()=>null)`,
cleared on success) drives a derived `stockStatus: 'live' | 'stale' | 'unknown'`, passed to the panel.
**`'stale'` = we have numbers but the last fetch failed or the board is degraded.**

## 7 · When there is no stock figure at all

**`stockStatus === 'unknown'`** when this event's stock has **never** loaded on this device — derived from
the existing `fetchedStockKeys` set, not a new flag.

> ✅ **THE `+` CONTROL IS UNTOUCHED. Measured: the diff contains ZERO changes to `atStockLimit`,
> `addable` or any `disabled=`.** An operator with no stock data can still take orders — they can see the
> counter and the software cannot.

**What changes is only that the absence is now visible.** Without it, "no badge" is indistinguishable
from "no limit set", and an operator could read *we have no idea* as *plenty*.

## 8 · 🔴 The wording — proposed, for your approval

**Stock never loaded on this device:**

> **Stock counts aren't loaded on this device. You can still take orders — check what you have.**

**Stock frozen (last fetch failed / board degraded):**

> **Stock last checked at 14:32. It may have moved since.**

| Constraint | How it is met |
|---|---|
| Must not imply a number is current | *"may have moved since"*, and the time is **named** rather than described |
| Must not imply stock has run out | Neither says sold out, empty or zero. *"aren't loaded"* is about **us**, not the stock |
| Plain English, OfflineBanner conventions | No "sync", no "server", no "fetch", no status codes |
| Must not block | *"You can still take orders"* says so explicitly |

⚠️ **In the code as working text so the path renders. Treat both as proposed.**
⚠️ **The stale line omits the time entirely if none is known, rather than printing a guess.**

## 9 · No local tally built

✅ **Confirmed: zero tally-shaped additions in the diff** (`grep` on added lines for
`offlineConsumed|tally|decrement|orders_count ±` returns **0**). **The panel's numbers are still the
server's; this change only says what they are worth.**

---

## Risk, and what must be verified where

| Change | Risk |
|---|---|
| **Seeding `deviceQueuedOrders`** | 🔴 **Medium, and it is the one to watch.** The list feeds the **board** (`pendingQueued`), `queuedPayment`, the capacity fold **and** `offlineConsumedByItem`. A malformed seeded object could render a broken order card or hold phantom capacity. **Mitigated by mapping from the queued body itself and by four dedup layers** |
| `stockFetchFailed` + `stockStatus` | **Low** — additive, derived, defaults to `'live'` when the prop is absent |
| The notice | **Low** — a div above the category tabs, rendered independently of them (it must not depend on a truck having >1 category) |

### 🔴 Must be on the tablet — I could exercise none of this

| # | Test | Pass condition |
|---|---|---|
| **T1** | Take 2 offline walk-ups, **force-quit**, relaunch | 🔴 **Both still on the board, and the day-load strip shows their oven load.** **This is the bug** |
| **T2** | T1, then reconnect and let them drain | Cards resolve to real orders; **the strip does not double-count at any point** |
| **T3** | T1, but let one op dead-letter (`conflict`) | It is **not** folded into capacity |
| **T4** | Cold launch with the backend unreachable, open Add-order | **"Stock counts aren't loaded…"**, badges absent, **and the `+` still works** |
| **T5** | Warm app, kill the network, open Add-order | **"Stock last checked at HH:MM…"** with a real time |
| **T6** | Both notices at arm's length in daylight | Legible; distinguishable from the amber degraded bar above |

### The laptop settled

The fold's behaviour with and without the seed, the dedup on `order_key`, the `create`/`conflict`
filters, drain-emptying, and that no control was disabled.

---

## What I could not establish

1. 🔴 **Anything on either real surface.** **No session for the dashboard or `/manage`.** T1-T6 all open.
2. **Whether a seeded card renders correctly.** I mapped every field `pendingQueued` and `queuedPayment`
   read, **but I have not seen one draw.**
3. **Whether `statusOverlay` interacts with seeded orders** — it is keyed on `order_key` and a seeded
   order has one, so it should, **but a force-quit also clears `statusOverlay`** and I did not trace what
   that costs.
4. **The Menu & Stock ↔ Add-order discrepancy** (the correction above) — **reported, not fixed**, because
   fixing it is the tally decision you have not made.

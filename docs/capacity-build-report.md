# Over-capacity: slot marker, submit-time confirm modal, acknowledgement column

**Date:** 28 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`, based on `5208cbe`
**Verification run:** `npx tsc --noEmit` → clean · `npx eslint` → no new diagnostics · 8-case behavioural harness on the engine (§6)
**Not run:** `next dev`, `next build`. **Migration written, NOT applied.**

---

## ⚠️ FLAGGED FIRST — garbled spans in the prompt

Four spans do not parse. Not silently repaired; my reading is stated so you can correct it. None changed what was built.

| # | Span as written | Read as |
|---|---|---|
| 1 | "a richer slot-select modal existed and was deleted in **4481n 2026**" | "deleted in **`448130f`, 15 June** 2026" — the commit I found in the history review |
| 2 | "comparing the tone the operator saw when they SELECTED the slot against the tone from **tsh** fetch" | "from **the fre**sh fetch" |
| 3 | "Use fit.bound_by — currently computed and **throe** it sharpens the message" | "computed and **thrown away — wher**e it sharpens the message" |
| 4 | "any change to the **ath**." (out-of-scope list) | "any change to the **customer p**ath" — I touched nothing under `app/trucks/` or `app/api/orders/submit/` either way |

---

## ⚠️ FLAGGED SECOND — a premise about the tree is wrong (not a blocker)

> *"this repo has an UNCOMMITTED, UNDEPLOYED step-zero batch"*

**It is committed.** `git status --short` shows only my two untracked review docs; the batch is `5208cbe "payment building"` (28 Jul 17:48), which contains `lib/order-repricing.ts`, the pricing/price-lock changes to `action/route.ts` and `page.tsx`, `lib/slot-bookings.ts` error returns, `lib/seed-demo-orders.ts`, and `20260728_orders_total_minor_deal_savings.sql`. That commit also carries the demo-restart reload work.

I did **not** stop, because the instruction's substance — *don't revert/refactor/tidy it, stop if a change collides* — is unaffected by whether it's committed, and being committed made collision-checking easier rather than harder. **Undeployed is unverified** (I have no deploy visibility); I have assumed it is, since two migrations are now pending.

**Collision check — none.** Step-zero's hunks in the two shared files vs mine:

| File | Step-zero (`5208cbe`) | This change | Overlap |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 81-89, 376-386, 401-405, 899-951, 1288, 1298-1301, 1321-1343, 1798-1813, **3407-3435** | **3379-3384** | none |
| `components/dashboard/AddOrderPanel.tsx` | **735-742** (`discountAmt: 0` / `dealSavings`) | 11, 227, 326, 676, 729, 847, 969, 1559 | none — my `capacityAcknowledged` is appended **after** `override` in the same object literal, 8 lines below their block, which is intact (verified by reading) |
| `app/api/dashboard/action/route.ts` | `deal_savings` + `total_minor` in `insertPayload` | one more key in the same literal | additive; both step-zero keys verified present |

---

## 1 · DIAGNOSE FIRST — does `buildSlotIndicators` expose the overage?

### **No. Only the tone. The overage was not reachable by any renderer.**

`lib/slot-display.ts:16-23` before this change:

```ts
export interface SlotIndicator {
  tone: SlotTone
  emoji: string
  label: string
  /** Raw occupancy for capacity fit-checks (cookingByCat / rateByCat / totalCooking).
   *  Same data the tone/label derive from — consumers must not recompute a parallel calc. */
  occ: WindowOccupancy | null
}
```

and the only write, `:112`:

```ts
    out.set(s.collection_time, { tone, emoji, label, occ: null as WindowOccupancy | null })
```

Three findings:

1. **`tone` cannot express it.** It goes red at `conc >= kitchenCapacity - EPS` (`lib/slot-availability.ts:737`), so a legitimately full window and a genuinely over-subscribed one are the same value. That is the exact conflation you described.
2. **`occ` is dead.** It is typed `WindowOccupancy | null` and assigned the literal `null` on every iteration — no call site can ever get occupancy from it.
3. **The data was right there and discarded.** The function already holds `w` (a `BackwardWindow`) at `:92`, carrying `remainingTotal`, `total`, `byCat`, `startMins`. It read `w.tone` and dropped the rest.

### What I changed, and whether the signature moved

**The signature did NOT move.** Parameter list, arity and types are byte-identical. I added one field to the **returned interface**, which is purely additive — no call site is obliged to change.

`lib/slot-display.ts:20-27` (new field) and `:122-124` (the derivation):

```ts
    // STRICTLY over only — same rule (and same raw field) as the breach detector. `remainingTotal`
    // is Infinity when no ceiling is set, so the subtraction can never produce a false positive.
    const overTotal = w && w.remainingTotal < -1e-9 ? Math.round(-w.remainingTotal) : 0

    out.set(s.collection_time, { tone, emoji, label, overTotal, occ: null as WindowOccupancy | null })
```

`-1e-9` mirrors `BREACH_EPS` in `lib/capacity-breach.ts:100`, so the marker and the banner apply **one** strictly-over rule and cannot disagree about what counts as over.

**All four call sites, and what each needed:**

| Call site | Change |
|---|---|
| `lib/slot-display.ts` (definition) | field added |
| `components/dashboard/AddOrderPanel.tsx:326` | fallback literal needed `overTotal: 0` (TS enforced) |
| `app/dashboard/[token]/page.tsx:3382` | fallback literal needed `overTotal: 0` (TS enforced) |
| `app/api/dashboard/route.ts:340` | **untouched** — reads `.tone` / `.label` only |
| `app/dashboard/[token]/page.tsx:1667` | **untouched** — same |

Both fallback literals were updated in the same pass, as required.

---

## 2 · Files and lines changed

### New

| File | Lines | What |
|---|---|---|
| `supabase/migrations/20260728_orders_capacity_ack.sql` | 34 (new) | §3 — one nullable column. **Not applied.** |

### Modified

| File | Lines | Change |
|---|---|---|
| `lib/slot-display.ts` | `20-27` | `SlotIndicator.overTotal` — new field, documented as display-only |
| " | `122-124` | strictly-over derivation from `w.remainingTotal` |
| `lib/slot-availability.ts` | `612-661` | **new** `contributingProductionSlots()` — which stored slots cook in a window span, with the 🔴 no-attribution warning |
| " | `938-950` | `fitOrderBackward` return type gains `peak` + `spanFromMins` (additive; params unchanged) |
| " | `1034-1053` | `reportedPeak` captured in both ceiling branches — **does not influence tone or fits** |
| " | `1057-1060` | `spanFromMins` = earliest window the order occupies |
| " | `1065` | return extended |
| `components/dashboard/AddOrderPanel.tsx` | `11-12` | imports `backwardWindowStepMins`, `contributingProductionSlots`, `normaliseOrderLines` |
| " | `227-248` | `capacityConfirm` state (the modal's payload) |
| " | `326` | fallback literal `overTotal: 0` |
| " | `676-680` | `submitManual(override, skipFitCheck, capacityAck)` — third param |
| " | `729-805` | `window.confirm()` **replaced** by the state-set; variant selection, `bound_by` parsing, contributor build |
| " | `847-850` | `capacityAcknowledged` on the manualOrder payload |
| " | `969-973` | ❗ on over-capacity slots in the Add Order picker |
| " | `1559-1631` | the modal JSX |
| `app/dashboard/[token]/page.tsx` | `3377-3384` | ❗ on over-capacity slots in the Edit picker + fallback literal |
| `app/api/dashboard/action/route.ts` | `871-877` | `capacity_ack_at` on the manual insert payload |

**The `cache: 'no-store'` fetch at `:696` is untouched**, as are the trigger point, `skipFitCheck` re-entry, and the fail-open `catch`. `handleSlotChange` (`:667-669`) is untouched — **no slot-select triggering was restored**.

---

## 3 · Change 1 — the mark

`❗`, appended straight after the tone emoji, in both pickers. No wording, no label text.

**Add Order** (`AddOrderPanel.tsx:969-973`):

```tsx
            const ind = slotIndicatorFor(s)
            // ❗ = this window is STRICTLY OVER the ceiling, not merely full. Red alone conflates the
            // two (tone goes red at conc >= ceiling), so an at-capacity slot and an over-subscribed
            // one were indistinguishable. A permanent property of the slot's load — it does NOT clear
            // when an operator acknowledges a placement. Mark only, no wording, by design.
            return <option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind.emoji}{ind.overTotal > 0 ? '❗' : ''}{ind.label ? ` ${ind.label}` : ''}</option>
```

**Edit modal** (`page.tsx:3382-3384`) — same rule, same mark, via the `editSlotIndicators` memo that already existed.

**At exactly the ceiling ⇒ no mark.** Verified by running (§6 case F): a window at `conc == 2` with `kitchenCapacity == 2` reports `tone: 'red'`, `remainingTotal: 0` → `overTotal: 0` → no `❗`. Genuinely over (case G): `total 4`, `remainingTotal −2` → `overTotal 2` → `❗`. No ceiling set (case H): `remainingTotal: Infinity` → `0` → no mark.

It derives from `production_slot_usage` only. Nothing about acknowledgement touches it.

---

## 4 · Change 2 — the modal

Trigger and fetch preserved exactly. Only the `window.confirm()` call became a state-set; the modal's two buttons now make the decision.

### Copy, verbatim as rendered

**Variant (a) — already over when they picked it, or their own basket tips it**

> ### 18:30 is over capacity
> The oven holds 2 items at a time. Around 18:25–18:30 it would be making 3.
>
> | | |
> |---|---|
> | #9 · 18:30 | 3 |
> | **This order** | **2 pizzas** |
>
> [ Pick another time ] [ Place it anyway ]

**Variant (b) — became over while they were building the order**

> ### 18:30 has filled up
> Another order came in while you were adding this one.
> The oven holds 2 items at a time. Around 18:25–18:30 it would be making 3.
>
> [ Pick another time ] [ Place it anyway ]

**Third variant (mine, not requested) — lead failure**

> ### 18:30 is too soon
> There isn't enough time to make this order by 18:30.
>
> [ Pick another time ] [ Place it anyway ]

**Per-category body**, substituted for the "oven holds" sentence when a batch is the binding constraint:

> Pizza can be made 2 at a time. Around 18:25–18:30 it would need 3.

Buttons behave as specified: **Pick another time** → `setManualSlot('')` + close, basket untouched, nothing submitted. **Place it anyway** → `submitManual(ov, true, true)`, carrying any stock override already granted.

### How the variant is chosen

Like-for-like comparison of the **basket-agnostic** window state, before and after:

```ts
            const seenTone = slotIndicators.get(effectiveSlot)?.tone ?? 'green'
            const freshStep = backwardWindowStepMins(freshCfgs)
            const freshW = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - freshStep) ?? null
            const freshTone = freshW?.tone ?? 'green'
```

`slotIndicators` is the memo the picker has been rendering from. Because `capacityInputs` has **no poll and no realtime invalidation**, it genuinely is what was on screen when the operator chose — that staleness is the reason it is a valid "what they saw" record. `freshTone` measures the same thing from the `no-store` read.

```
variant = bind is lead        → 'toosoon'
        = seenTone !== 'red' && freshTone === 'red' → 'filled'
        = otherwise                                  → 'over'
```

**Why "otherwise → over" and not a third capacity variant.** The comparison is basket-agnostic on both sides, so `seenTone === freshTone` means nothing moved underneath the operator. Two cases land there: the slot was already red when they picked it, and — much more commonly — the slot was fine and *this basket* is what tips it. Both are honestly "18:30 is over capacity"; neither can honestly say "another order came in", which would be a fabrication. Variant (b) fires only when the board demonstrably worsened.

### What I did with `bound_by`

Previously computed and thrown away. Now parsed into a discriminated union (`:768-776`):

| `bound_by` | Treatment |
|---|---|
| `"global ceiling"` | `{kind:'ceiling', limit: kitchenCapacity, needed: fit.peak}` → the "oven holds N" sentence |
| `"<Cat> used/batch"` (e.g. `"Pizza 3/2"`) | regex `^(.+?) (\d+)\/(\d+)$` → `{kind:'category', cat, limit: batch, needed: used}` → **"Pizza can be made 2 at a time… it would need 3."** Sharper than the global sentence: it names the real constraint and uses the category's own figures, not the global concurrency |
| `"too soon (insufficient lead)"` | `{kind:'lead'}` → **its own title and body.** This is a lead-time failure, not a capacity one. The over-capacity copy would have been actively wrong — there is no overage, no meaningful window total, and no contributing orders to list. Reusing the capacity wording here would have told the operator something false, so I split it rather than force-fit it |

**Which one actually fires for the Gusto case:** `"Pizza 3/2"`, not `"global ceiling"` — verified by running (§6 case A). `consider()` keeps the **first** red (`r > bindRank`, strictly greater), and the per-category loop runs before the ceiling check, so a category bind wins when both are red. Your example copy corresponds to the ceiling branch, which fires when the total is over but no single category's batch is.

### The contributing-orders list, and the hard limit

Built only for variant `'over'`. Two steps, both respecting the aggregate constraint:

1. **Which slots feed the window span** — new exported helper `contributingProductionSlots` (`lib/slot-availability.ts:626`), sharing the seating cadence with `projectBackwardOccupancy` so the two cannot disagree. Overlap test: `deadline - numWindows*prep < toMins && deadline > fromMins`.
2. **Which orders are at those slots** — filtered from the panel's existing `orders` prop by slot, occupying status, and event, with each order's **own** counted quantity via `normaliseOrderLines` (the shared extractor, so deal constituents count).

**🔴 The limit is enforced structurally, not just documented.** The helper returns **slots, never orders**, and its doc comment says why:

> *`productionSlotUnits` is a per-slot AGGREGATE: 5 pizzas at 18:30 may be two orders, and the units that spill backward from it into an earlier window belong to those orders JOINTLY. There is no information anywhere in the projection that could attribute a spilled unit to one order — CookInterval carries no provenance and the source deadline is discarded during seating.*

So the modal lists `#9 · 18:30 — 3`, i.e. **order, its collection slot, its own quantity**. It never says or implies which order supplied which spilled unit. The final bold row is this order's own count.

---

## 5 · Change 3 — the acknowledgement column

### ✅ Confirmed: the manual insert is a DIRECT insert, not `place_order_atomic`

`app/api/dashboard/action/route.ts` writes walk-ups via `supabase.from('orders').upsert(insertPayload, { onConflict: 'order_key', ignoreDuplicates: true })` when the client minted a key, else `supabase.from('orders').insert(insertPayload).select('order_key').single()`. **No RPC on this path.** `place_order_atomic` is the customer path only (`app/api/orders/submit/route.ts`).

**No function-body change is needed and none was made.** The customer path cannot produce an acknowledged over-capacity order — there is no operator present to acknowledge, and that path is hard-gated by `earliestBackwardFitSlot`. This deliberately avoids the silent-skip failure mode that cost you the outage: a missed `CREATE OR REPLACE FUNCTION` fails quietly, a missed `ADD COLUMN` fails loudly at the first insert.

### The column

**`supabase/migrations/20260728_orders_capacity_ack.sql`** — one statement, idempotent, house pattern (header explaining the *why*, `add column if not exists`, `comment on column`, closing `notify pgrst`).

```sql
alter table orders
  add column if not exists capacity_ack_at timestamptz;
```

**`timestamptz`, not boolean** — still one nullable column, but it records *when* as well as *whether*, at no extra cost. `NULL` = no acknowledgement, which is the correct value for every existing row and for every order that arrives unattended.

**The timestamp is server-minted** (`route.ts:877`) — the client sends a boolean intent and can never supply or backdate a time:

```ts
          capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
```

### 🔴 DEPLOY-COUPLED — run before deploying

The key is named on **every** walk-up insert, not only acknowledged ones (it writes `NULL` otherwise), so PostgREST would return `PGRST204` and break walk-up creation if the app ships first. The reverse order is safe: nullable, no default, invisible to current code.

**Nothing reads it.** Narrowing the banner is explicitly a later task and was not touched.

---

## 6 · Verified by running vs by reading

### Ran

- **`npx tsc --noEmit` → clean.**
- **`npx eslint`** on all five changed files. One warning surfaced in `lib/slot-availability.ts:674` — `'step' is assigned a value but never used`. **Pre-existing**, verified against `HEAD`: at `git show HEAD:lib/slot-availability.ts` the same `const step` is declared inside `projectBackwardOccupancy` and referenced only in a comment. My insertion shifted its line number, nothing more. Left alone (tidying it is not in scope). No other new diagnostics; the rest are pre-existing at lines outside this diff.
- **8-case behavioural harness** — transpiled the engine to CommonJS and ran it against the real Gusto shape (ceiling 2, window 5, pizza prep 300s/batch 2, event 17:00):

| # | Case | Result |
|---|---|---|
| A | #14 (2 pizzas) into an 18:30 already holding 3 | `fits:false`, `bound_by:"Pizza 3/2"`, `peak:3`, `spanFromMins:1105` → the **category** copy, span 18:25–18:30 ✓ |
| B | contributing slots for that span | `["18:30"]` — 18:20 cooks `[18:15,18:20)`, correctly excluded ✓ |
| C | 5 pizzas onto an empty board | `spanFromMins:1095` (18:15) — the span reaches back 3 batches ✓ |
| D | contributing slots for `[18:15,18:30)` | `["18:20","18:30"]` — both overlap ✓ |
| E | an order that fits | `fits:true` → **no modal** ✓ |
| F | window at exactly the ceiling | `tone:'red'`, `remainingTotal:0` → **`overTotal:0`, no ❗** ✓ |
| G | genuinely over (the real breach shape) | `total:4`, `remainingTotal:−2` → **`overTotal:2`, ❗** ✓ |
| H | no ceiling configured | `remainingTotal:Infinity` → `overTotal:0`, no ❗ ✓ |

F and G together are the specific requirement — full is not over.

### Read only — NOT verified by running

1. **The modal has never been rendered.** No `next dev`, per instruction. Its layout, wrapping of long copy, and behaviour on a narrow iPad column are unverified. The wrapper classes are copied from the panel's existing item-modifier modal (`:1561-1563`) so it should match, but "should" is doing work there.
2. **The full submit round-trip was not exercised.** State-set → modal → "Place it anyway" → `submitManual(ov, true, true)` → payload → insert typechecks end to end and I traced it by reading, but no order was placed.
3. **The variant-(b) path was not observed.** Producing it needs a real order to land between select and submit. The comparison is two lines and I reasoned it carefully, but I did not stage the race.
4. **`capacity_ack_at` has never been written.** The migration is unapplied by instruction, so the column does not exist yet; the insert would currently `PGRST204`. This is expected and is exactly the deploy-coupling above.
5. **The ❗ in a `<select>` `<option>`.** Rendering of emoji inside native `<option>` text varies by platform; unverified on the operator's actual device. It is plain text in the option label, the same mechanism as the existing `🟢/🟡/🔴` and `⚠️`, so the risk is low but real.
6. **Two nuances of `bound_by` I surfaced without changing:** (a) `consider()` keeps the *first* red, so when both a category batch and the global ceiling are breached the operator sees only the category one; (b) the per-category `used/batch` figure comes from whichever window bound first, which for a multi-batch order need not be the window `spanFromMins` names — hence "Around" in the copy. Both are pre-existing engine behaviour that I am now displaying rather than discarding; neither was altered.
7. **Contributor counts for orders whose items are not in `itemCategoryMap`.** An unknown/renamed item name resolves to no category and is counted as zero — the same name-join limitation every other capacity path carries. Not verified against live data.
8. **"Undeployed"** — I have no deploy visibility and took it as given. Two migrations are now pending (`…total_minor_deal_savings`, `…capacity_ack`); both are deploy-coupled and both must run first.

---

## 7 · Out of scope — confirmed untouched

Slot-select triggering (`handleSlotChange` is still the two-line setter) · `CapacityBreachBanner` · the edit path's missing capacity check (`app/api/dashboard/action/route.ts` still has **zero** capacity-engine calls) · server-side checking inside the event lock · the customer path (`app/trucks/`, `app/api/orders/submit/`) · the `cache: 'no-store'` fetch · the fail-open `catch` · everything in `5208cbe`.

# The stock guard now answers the availability question

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration is needed and none was written** — no column was added, no table altered, and the two flags this reads (`event_item_stock.available`, `menu_items_db.is_available`) already exist and are already populated.

**One file changed:**

```
lib/stock-guard.ts | 72 ++++++++++++++++++++++++++++++++++++++++++++++++++----
1 file changed, 67 insertions(+), 5 deletions(-)
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: `loadPriceBook`, `checkClosedCategories`, `findSoldOutOption`, `checkOptionCeilingShortfall`, `enforceStockLimits`, `place_order_atomic`, capture, promotion and the ledger are all byte-identical.

---

## 1. WHICH OF THE THREE THIS NOW CHECKS

**All three.** The menu composes them with AND at `app/api/menu/[truckId]/route.ts:560-567`; the guard now composes the same three, so an item that has vanished from the customer's menu can no longer be ordered from a stale basket or a crafted request.

| What an operator means | Column | Checked now? |
|---|---|---|
| "sold out for this event" (the dashboard toggle) | `event_item_stock.available === false` | **YES — new** |
| "hidden from the menu" (Settings) | `menu_items_db.is_available === false` | **YES — new** |
| a count that has run out | `event_item_stock.stock_count ?? menu_items_db.default_stock` vs live sold | yes — unchanged |

**Deliberately excluded, and why.** The menu's AND has two further legs, and neither is an availability column:

- **An unsatisfiable required group** (`hasUnsatisfiableRequiredGroup`) already has an owner on the order path — the required-modifier guard at `/api/orders/submit`, which returns `{ requiredModifier: true }` with "Sorry, X is sold out." for exactly that case. Duplicating it here would be a second opinion on a question that already has one. *(Observed live during verification: three of the first-choice test items were refused by that guard before reaching the stock block, which is what forced the harness onto modifier-free items.)*
- **Pre-order.** The OPEN-window leg is enforced at `submit/route.ts:506-516` (403 `preorder_not_open`). 🔴 **The `sold_out`-past-deadline leg has no submit-side owner that I could find** — `isPreorderDeadlinePassed` is consulted at `:959` only for the `force_pending` rollup. The menu hides such an item; nothing refuses it. **That is a separate gap of the same shape, it is not an availability column, and I did not smuggle it into this change.** It is recorded in the code comment and flagged below.

`menu_items_db.is_active` is also not checked: it is an archive flag, it is not one of the three, and `loadPriceBook` does not filter on it either.

---

## 2. THE CHANGE: ONE COLUMN ON EACH READ, NO NEW QUERY

**The select** (`lib/stock-guard.ts`, inside `checkStockShortfall`) — the same two queries, the same filters, one extra column each:

```ts
  // `is_available` and `available` ride along on the two reads this function already makes — the SAME
  // rows, the SAME filters, one extra column each. See the availability note in the header.
  const [sold, { data: menuItems }, { data: menuCats }, { data: overrides }, { data: catStock }] = await Promise.all([
    getLiveItemCounts(supabase, truckId, eventId),
    supabase.from('menu_items_db').select('name, default_stock, is_available').eq('truck_id', truckId),
    supabase.from('menu_categories').select('name, default_stock').eq('truck_id', truckId),
    supabase.from('event_item_stock').select('item_name, stock_count, no_item_cap, available').eq('truck_id', truckId).eq('event_id', eventId),
    supabase.from('event_category_stock').select('category, stock_count').eq('truck_id', truckId).eq('event_id', eventId),
  ])
```

**The predicate**, added after the ceiling maps and before the shared engine:

```ts
  const perEventUnavailable = new Set<string>()
  ;(overrides || []).forEach((o: any) => { if (o.available === false) perEventUnavailable.add(o.item_name) })
  const menuWideHidden = new Set<string>()
  ;(menuItems || []).forEach((i: any) => { if (i.is_available === false) menuWideHidden.add(i.name) })

  const unavailable: { name: string; remaining: number }[] = []
  const namedUnavailable = new Set<string>()
  for (const l of orderLines) {
    if (namedUnavailable.has(l.name)) continue
    if (perEventUnavailable.has(l.name) || menuWideHidden.has(l.name)) {
      namedUnavailable.add(l.name)
      unavailable.push({ name: l.name, remaining: 0 })
    }
  }
```

**And the return**, which preserves the old one exactly when nothing is flagged:

```ts
  const shortfall = checkCeilingShortfall(orderLines, sold, itemCeiling, { keyOf: ..., ceiling: catCeiling })

  // NOTHING MARKED UNAVAILABLE → the return value is the ceiling engine's, unchanged, including its
  // null. Every order that placed before this block existed still places, and every count shortfall
  // still reads exactly as it did.
  if (!unavailable.length) return shortfall

  // Unavailable lines come FIRST: callers that name a single item (promoteDraft's refusal message, the
  // operator 409) should name the one that cannot be ordered at any quantity, not one that is merely
  // short. A name in both lists appears once — it is already reported at remaining 0.
  return [...unavailable, ...(shortfall || []).filter(s => !namedUnavailable.has(s.name))]
```

**No new query was needed, exactly as the diagnosis said.** The return type is unchanged (`{ name, remaining }[] | null`), so all three call sites — `submit/route.ts:876`, `promote-draft.ts:205`, `dashboard/action/route.ts:1245` — compile and behave without modification.

**`remaining: 0` is not a new shape or a new message.** An item exhausted *by count* already returns it: `checkCeilingShortfall` pushes `Math.max(0, cap)`. Verified live in case (c) below, where the count case and the availability case produce identical JSON.

⚠️ **The operator path inherits this, correctly.** `dashboard/action/route.ts:1245` runs inside `if (orderEventId && !override)`, so a walk-up order for a hand-marked sold-out item is refused **unless** the operator explicitly overrides — the same informed-override behaviour the closed-category and option checks already have. Nothing about that gate was changed.

---

## 3. DEAL CONSTITUENTS

**Resolved per line, not per top-level item — confirmed.** `orderLines` reaches this function already flattened by `normaliseOrderLines` (`lib/slot-bookings.ts:21-35`), which pushes every deal slot value as its own line:

```ts
  ;(deals || []).forEach(d => {
    Object.values(d.slots || {}).filter(Boolean).forEach(name =>
      lines.push({ name: String(name), quantity: 1 })
    )
  })
```

The new loop iterates `orderLines`, so a constituent is matched by **its own item name**. The deal's own name is never looked up — it is a bundle, not a menu item, and has no availability row. All three call sites pass flattened lines (`submit:323`, `promote-draft:143`, `action:1089`).

Measured (case (e)):

```
normaliseOrderLines([], deals) = [{"name":"Fish Cake","quantity":1},{"name":"Jasmine Rice","quantity":1}]
guard on those lines          = [{"name":"Fish Cake","remaining":0}]
```

---

## 4. WHAT THE CUSTOMER SEES — NO NEW SURFACE

**No new surface was built. No response shape was added. No copy was written.** Both messages below already existed and are quoted from the live run.

**Pay at hatch** — `submit/route.ts:877-882` returns the existing 409:

```json
HTTP 409  {"error":"Some items just sold out","stock":true,"items":[{"name":"Fish Cake","remaining":0}]}
```

The order page's existing handler (`app/trucks/[slug]/order/page.tsx:1653`) then does what it always did: `capBasketToRemaining` — which at `remaining: 0` **drops the line from the basket entirely** (`:944`, `next.filter(b => b.quantity > 0)`) — re-fetches `/api/menu`, and renders

> **"Sorry — only 0 Fish Cake left now. We've updated your order — please review and confirm."**

⚠️ **"only 0 X left" is the pre-existing wording for an item exhausted by count**, and it is what a count-exhausted item has always produced. Rewording it would have been a new surface, which the brief forbids; it is left exactly as it was.

**Card** — `promoteDraft` returns the existing refusal, and `/api/payments/return:136` redirects to `?payment_failed=<message>`, which the order page reads at `:235`:

> **"Sorry — Fish Cake sold out while you were paying, so we could not place your order. No money has been taken."**

---

## 5. THE HOLD IS RELEASED ON A CARD REFUSAL

**Confirmed — the availability refusal takes the existing stock branch, which calls `releaseHold`.** It is the same `checkStockShortfall` return value, so it enters the same `if (shortfall)` at `promote-draft.ts:206-212`:

```ts
        const shortfall = await checkStockShortfall(draft.truck_id, eventRow.id, eventDate, orderLines, itemCatMap)
        if (shortfall) {
          const names = shortfall.map(s => s.name).join(', ')
          await markPromotionFailed(supabase, orderKey, `stock: ${names}`)
          const cancelled = await releaseHold(supabase, draft)
          return { status: 'refused', orderKey, reason: `stock: ${names}`, cancelled,
                   customerMessage: `Sorry — ${shortfall[0].name} sold out while you were paying, so we could not place your order. No money has been taken.` }
        }
```

Proved against real Stripe in case (b): `status=canceled`, `cancellation_reason=abandoned`.

---

## 6. A SOLD-OUT ITEM IS STILL PRICEABLE

**Confirmed, and this is the evidence rather than an assertion.** `loadPriceBook` was not touched — `git diff --stat` shows `lib/stock-guard.ts` as the only modified file — so it still filters on `truck_id` and nothing else, and the paired comments at `submit/route.ts:421-430` and in `lib/order-repricing.ts` still hold.

The order of the route is unchanged: **price → option backstop → lock → closed → stock → insert**. A sold-out item therefore prices successfully, `repriced.unresolved` stays empty, the `menuChanged: true` refusal is not reached, and the order falls through to the stock guard.

**Measured, case (a):**

```json
{"error":"Some items just sold out","stock":true,"items":[{"name":"Fish Cake","remaining":0}]}
```

Not `menuChanged`. Not "The menu has changed". The customer gets the stock message, which is the whole reason the price book must not filter on availability.

---

## VERIFICATION

Every case below ran against the **real** `POST` handler of `app/api/orders/submit/route.ts`, the **real** `promoteDraft`, real Supabase rows and the real Stripe sandbox. Emails were intercepted at `globalThis.fetch` before any module was imported; **zero were transmitted**.

The two hand-marked rows used as fixtures (`Fish Cake`, `Chicken Satay`, both `available=false` for event `a79a8313`) are the **operator's own toggles from this morning** — they were read, never written, and are unchanged at the end.

### (a) PAY AT HATCH, item marked sold out for the event

```
HTTP 409  {"error":"Some items just sold out","stock":true,"items":[{"name":"Fish Cake","remaining":0}]}
customer sees: "Sorry — only 0 Fish Cake left now. We've updated your order — please review and confirm."
capBasketToRemaining(remaining=0) drops the line from the basket entirely.
orders created: 0
```

This is the exact basket that placed as order 63 this morning.

### (b) CARD, refused at promotion, hold released

```
[authorize] pi=pi_3U3wFP2fB4PPCw2D056CbeHH draft=e6c9fda3-... amount_minor=600 capture_method=manual
submit HTTP 200  requiresAuthorization=true orderKey=e6c9fda3-bf5d-49bb-997c-caba1c5bb523
stripe BEFORE promotion: status=requires_payment_method amount=600

[promote] hold released pi=pi_3U3wFP2fB4PPCw2D056CbeHH draft=e6c9fda3-... (cancelled)
promoteDraft -> {"status":"refused","reason":"stock: Fish Cake","cancelled":true,
                 "customerMessage":"Sorry — Fish Cake sold out while you were paying, so we could not
                  place your order. No money has been taken."}

stripe AFTER promotion: status=canceled  cancellation_reason=abandoned
draft after: {"promoted_at":"...10:52:32.306Z","promotion_failed_at":"...10:52:32.862Z",
              "promotion_failure_reason":"stock: Fish Cake","authorization_cancelled_at":"...10:52:33.354Z"}
orders with that key: 0
emails transmitted: 0
```

🔴 **The hold is cancelled at Stripe, no order exists, and the failure is recorded on the draft.** This is the shape order 62 should have taken this morning.

⚠️ **One deliberate deviation, stated.** The PaymentIntent was **never confirmed** (`requires_payment_method`), so Stripe emitted no event and the **deployed** webhook — which is still running the unfixed code — could not race this harness and place a real order. The refusal path is unaffected by that: `promoteDraft` reads no payment state before the guard, and `releaseHold` cancels an unconfirmed intent by the same call.

### (c) CEILING REACHED — the existing shortfall, unchanged

`stock_count = 0`, `available` left **true**, so only the count leg can fire:

```
guard BEFORE this change: [{"name":"PorkCrackers from Thailand","remaining":0}]
guard AFTER  this change: [{"name":"PorkCrackers from Thailand","remaining":0}]
IDENTICAL: true
HTTP 409  {"error":"Some items just sold out","stock":true,"items":[{"name":"PorkCrackers from Thailand","remaining":0}]}
```

"BEFORE" is `git show HEAD:lib/stock-guard.ts` loaded side by side with the working copy and run against the same live rows.

### (d) IN-STOCK ORDER — places normally

```
guard BEFORE: null   AFTER: null   IDENTICAL: true
HTTP 200  {"success":true,"orderId":"64","orderKey":"2a3b3b53-...","truckName":"Test Kitchen",
           "slot":"17:00","autoAccepted":true,"slotChanged":false,"total":3.5}
ORDER CREATED: #64 status=confirmed total=3.5 items=[{"name":"Prawn Cracker& Sweet Chili dip","quantity":1,"unit_price":3.5}]
emails intercepted (NONE transmitted): [{"to":[{"email":"harness@example.invalid"}],"subject":"Order #64 confirmed"}]
```

Placed, slotted, auto-accepted, confirmation composed — unchanged in every respect.

### (e) DEAL whose constituent is sold out

A bundle `Verify Deal` (Starters + Sides) was created for the test, ordered with `slots: { 1: 'Fish Cake', 2: 'Jasmine Rice' }`, and deleted afterwards:

```
normaliseOrderLines([], deals) = [{"name":"Fish Cake","quantity":1},{"name":"Jasmine Rice","quantity":1}]
guard on those lines: [{"name":"Fish Cake","remaining":0}]
HTTP 409  {"error":"Some items just sold out","stock":true,"items":[{"name":"Fish Cake","remaining":0}]}
```

The deal priced fine; the **constituent** was refused by name.

### (f) MENU-WIDE HIDDEN

`menu_items_db.is_available` set false for one item, ordered, then reverted:

```
HTTP 409  {"error":"Some items just sold out","stock":true,"items":[{"name":"Sesami Prawn Toast","remaining":0}]}
reverted: {"name":"Sesami Prawn Toast","is_available":true}
```

### EVERY WRITE, AND THE CLEANUP

| Write | Undone? |
|---|---|
| `menu_items_db.is_available` "Sesami Prawn Toast" -> false, then -> true | **yes**, verified `{"is_available":true}` |
| `event_item_stock` INSERT "PorkCrackers from Thailand" `stock_count=0`, then DELETE | **yes**, the event's rows are byte-identical to the pre-run snapshot |
| `bundles_db` INSERT "Verify Deal", then DELETE | **yes**, `bundles: 0` (the table is empty for this truck, as it was) |
| `orders` INSERT #64 (case d), then DELETE + `rebuildProductionSlotUsage` | **yes**, `orders: 0` |
| `order_drafts` INSERT (case b) x2 across two runs, then DELETE | **yes**, `drafts: 0` |
| Stripe PaymentIntents `pi_3U3wEa2fB4PPCw2D0qtxqThe`, `pi_3U3wFP2fB4PPCw2D056CbeHH` | **cancelled**; sandbox intents cannot be deleted |
| Display number 64 consumed by case (d) | 🔴 **not reversible** — the per-event counter does not go backwards. Declared. |

```
leftovers: {"orders":0,"drafts":0,"bundles":0}
event_item_stock for the event now: [{"item_name":"Fish Cake","available":false,"stock_count":null},
                                     {"item_name":"Chicken Satay","available":false,"stock_count":null}]
   (identical to the PRE-EXISTING list read before anything ran)
EMAILS TRANSMITTED: 0 (intercepted 1)
```

⚠️ Two lines of the harness's own `WRITES PERFORMED` log carry stale labels ("Springrolls", "Tom Yum") from an earlier choice of test items; the items actually written are the ones named in the table above and in the case output. Reported rather than tidied away.

A first run aborted early (three items turned out to have required modifier groups and were refused at 400 before reaching the stock block); its draft was deleted and its PaymentIntent cancelled in the same run's cleanup.

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `lib/stock-guard.ts` | 67 | 188 | 3 | 3 | `—─→` before and after |

**No file gained a character class.** `lib/stock-guard.ts` has never contained `🔴` or `⚠️` — the new comments use plain uppercase for emphasis, matching the file's existing style — and the added characters are only the em dash and the box-drawing rule it already uses. No other file was modified.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **A separate gap of the same shape, found while checking the menu's AND and NOT fixed here:** a pre-order item past a `sold_out` deadline is hidden by the menu, and I could find nothing on the order path that refuses it. It is not an availability column and is outside this build's scope. Recorded in the code comment and here.
- ⚠️ **Orders 62 and 63 exist and were not touched.** This change stops the next one; it does not retract those.
- ⚠️ **Deploy note:** the fix lives in a shared library called by three routes. Until it is deployed, the live site behaves as it did this morning — the harness's card case was deliberately arranged so the deployed code could not act on it.
